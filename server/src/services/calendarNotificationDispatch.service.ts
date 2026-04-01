import mongoose from "mongoose";
import { CalendarEventModel } from "../models/calendarEvent.model.js";
import { CalendarEventTypeModel } from "../models/calendarEventType.model.js";
import { LocationModel } from "../models/location.model.js";
import { UserModel } from "../models/user.model.js";
import { CalendarNotificationLogModel } from "../models/calendarNotificationLog.model.js";
import { CalendarNotificationSettingsService } from "./calendarNotificationSettings.service.js";
import { NotificationService } from "./notification.service.js";
import { listUserIdsForRoleAtLocation } from "./calendarNotificationRecipients.service.js";
import { logger } from "../utils/logger.util.js";
import type {
  NotificationChannel,
  SendNotificationOptions,
} from "../types/notification.types.js";
import { normalizeRoleBindingChannels } from "../utils/calendarRoleBindingChannels.util.js";
import {
  buildCalendarEventDetailFields,
  formatShortEventStart,
} from "../utils/calendarEmailTemplate.util.js";
import type { CalendarNotifyKind } from "../utils/calendarNotificationSchedule.util.js";

const settingsService = new CalendarNotificationSettingsService();
const notificationService = new NotificationService();

function getDashboardCalendarUrl(): string {
  const base = (
    process.env.CLIENT_URL ??
    process.env.APP_URL ??
    process.env.FRONTEND_URL ??
    "http://localhost:5173"
  ).replace(/\/$/, "");
  return `${base}/dashboard/calendar-events`;
}

async function loadFirstNamesByUserId(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const ids = userIds.map((id) => new mongoose.Types.ObjectId(id));
  const users = await UserModel.find({ _id: { $in: ids } }).select("firstName").lean();
  return new Map(
    users.map((u) => {
      const doc = u as { _id: mongoose.Types.ObjectId; firstName?: string };
      return [doc._id.toString(), doc.firstName?.trim() ?? ""];
    }),
  );
}

function channelsToList(channels: {
  inApp: boolean;
  email: boolean;
  sms: boolean;
}): NotificationChannel[] {
  const out: NotificationChannel[] = [];
  if (channels.inApp) out.push("in_app");
  if (channels.email) out.push("email");
  if (channels.sms) out.push("sms");
  return out;
}

async function tryLogNotification(params: {
  calendarEventId: string;
  userId: string;
  kind: CalendarNotifyKind;
  fireKey: string;
}): Promise<boolean> {
  try {
    await CalendarNotificationLogModel.create({
      calendarEventId: new mongoose.Types.ObjectId(params.calendarEventId),
      userId: new mongoose.Types.ObjectId(params.userId),
      kind: params.kind,
      fireKey: params.fireKey,
    });
    return true;
  } catch (e: unknown) {
    const code = (e as { code?: number })?.code;
    if (code === 11000) return false;
    logger.error("Calendar notification log insert failed", { e });
    return false;
  }
}

type CalendarSendOutcome = "delivered" | "dedupe_skip" | "rollback";

async function sendCalendarNotificationWithLogRollback(params: {
  calendarEventId: string;
  userId: string;
  kind: CalendarNotifyKind;
  fireKey: string;
  sendOptions: SendNotificationOptions;
}): Promise<CalendarSendOutcome> {
  const { calendarEventId, userId, kind, fireKey, sendOptions } = params;
  const logged = await tryLogNotification({ calendarEventId, userId, kind, fireKey });
  if (!logged) {
    logger.debug("Calendar notification: skipped (already logged / duplicate)", {
      calendarEventId,
      userId,
      kind,
      fireKey,
    });
    return "dedupe_skip";
  }
  const delivered = await notificationService.sendReturningDelivered(sendOptions);
  if (!delivered) {
    await CalendarNotificationLogModel.deleteOne({
      calendarEventId: new mongoose.Types.ObjectId(calendarEventId),
      userId: new mongoose.Types.ObjectId(userId),
      kind,
      fireKey,
    });
    logger.warn("Calendar notification: no channel delivered, removed dedupe log for retry", {
      calendarEventId,
      userId,
      kind,
      fireKey,
    });
    return "rollback";
  }
  logger.debug("Calendar notification: delivered", {
    calendarEventId,
    userId,
    kind,
    fireKey,
    type: sendOptions.type,
    channels: sendOptions.channels,
  });
  return "delivered";
}

/**
 * Send calendar notifications for one event, one kind, one fireKey (Agenda calendar:notify-one).
 */
export async function dispatchCalendarNotificationForEvent(params: {
  calendarEventId: string;
  kind: CalendarNotifyKind;
  fireKey: string;
}): Promise<void> {
  const { calendarEventId, kind, fireKey } = params;
  const now = new Date();

  const ev = await CalendarEventModel.findById(calendarEventId).lean();
  if (!ev) {
    logger.debug("calendar:notify-one skip (event deleted)", { calendarEventId, kind, fireKey });
    return;
  }

  const settings = await settingsService.get();
  if (!settings.roleEventBindings?.length) return;

  const locationId = ev.locationId.toString();
  const eventTypeId = ev.eventTypeId.toString();
  const eventId = ev._id.toString();

  const bindings = settings.roleEventBindings.filter(
    (b) => String(b.eventTypeId) === eventTypeId,
  );
  if (bindings.length === 0) return;

  const typeDoc = await CalendarEventTypeModel.findById(ev.eventTypeId).lean();

  const tz = ev.timeZone;
  const locationDoc = await LocationModel.findById(ev.locationId).select("storeName address").lean();
  const parts = locationDoc
    ? [locationDoc.storeName, locationDoc.address].filter(Boolean)
    : [];
  const locationLine = parts.length ? parts.join(" · ") : "—";

  const eventTypeName = typeDoc?.name ?? "Calendar event";
  const eventTypeColorHex = typeDoc?.colorHex ?? "#6B7280";
  const detailFields = buildCalendarEventDetailFields({
    ev: {
      title: ev.title,
      description: typeof ev.description === "string" ? ev.description : "",
      start: ev.start,
      end: ev.end,
      timeZone: tz,
    },
    eventTypeName,
    eventTypeColorHex,
    locationLine,
  });

  const calendarUrl = getDashboardCalendarUrl();
  const startShort = formatShortEventStart(ev.start, tz);

  for (const b of bindings) {
    const roleId = String(b.roleId);
    const userIds = await listUserIdsForRoleAtLocation(roleId, locationId);
    const chans = channelsToList(normalizeRoleBindingChannels(b.channels));
    if (chans.length === 0) continue;

    const willSendReminder = Boolean(b.notifyReminders && kind === "reminder");
    const willSendHourBefore = Boolean(b.notifyReminders && kind === "hour_before");
    const willSendStart = Boolean(b.notifyOnStart && kind === "start");
    if (!willSendReminder && !willSendHourBefore && !willSendStart) continue;

    const firstNameById =
      chans.includes("email") && userIds.length > 0
        ? await loadFirstNamesByUserId(userIds)
        : new Map<string, string>();

    if (willSendReminder) {
      const title = "Upcoming calendar event";
      const message = `Reminder: "${ev.title}" — ${startShort} (${tz}).`;
      for (const uid of userIds) {
        await sendCalendarNotificationWithLogRollback({
          calendarEventId: eventId,
          userId: uid,
          kind: "reminder",
          fireKey,
          sendOptions: {
            recipientId: uid,
            type: "calendar_event_reminder",
            title,
            message,
            data: { calendarEventId: eventId, locationId, eventTypeId },
            channels: chans,
            emailSubject: title,
            emailTemplateFile: "calendar-event-reminder-email.ejs",
            emailTemplateData: {
              ...detailFields,
              headline: "Reminder: upcoming event",
              summaryMessage: `This is a heads-up for an event on your calendar: "${ev.title}" at ${startShort}.`,
              firstName: firstNameById.get(uid) ?? "",
            },
            actionUrl: calendarUrl,
            emailButtonText: "Open calendar",
            smsBody: message.slice(0, 300),
          },
        });
      }
    }

    if (willSendHourBefore) {
      const minsUntil = Math.max(
        1,
        Math.round((ev.start.getTime() - now.getTime()) / 60_000),
      );
      const title =
        minsUntil >= 55 && minsUntil <= 65 ? "Calendar event in about 1 hour" : "Upcoming calendar event";
      const message =
        minsUntil >= 55 && minsUntil <= 65
          ? `${ev.title} starts in about 1 hour (${tz}).`
          : `${ev.title} starts in ${minsUntil} minute${minsUntil === 1 ? "" : "s"} (${tz}).`;
      const urgencyLine =
        minsUntil >= 55 && minsUntil <= 65
          ? "This event starts in about 1 hour."
          : `This event starts in ${minsUntil} minute${minsUntil === 1 ? "" : "s"}.`;
      const countdownLine = `${ev.title} · ${startShort}`;
      for (const uid of userIds) {
        await sendCalendarNotificationWithLogRollback({
          calendarEventId: eventId,
          userId: uid,
          kind: "hour_before",
          fireKey,
          sendOptions: {
            recipientId: uid,
            type: "calendar_event_hour_before",
            title,
            message,
            data: { calendarEventId: eventId, locationId, eventTypeId },
            channels: chans,
            emailSubject: title,
            emailTemplateFile: "calendar-event-hour-before-email.ejs",
            emailTemplateData: {
              ...detailFields,
              urgencyLine,
              countdownLine,
              summaryMessage: message,
              firstName: firstNameById.get(uid) ?? "",
            },
            actionUrl: calendarUrl,
            emailButtonText: "Open calendar",
            smsBody: message.slice(0, 300),
          },
        });
      }
    }

    if (willSendStart) {
      const title = "Event starting now";
      const message = `"${ev.title}" is scheduled to start now (${startShort}, ${tz}).`;
      for (const uid of userIds) {
        await sendCalendarNotificationWithLogRollback({
          calendarEventId: eventId,
          userId: uid,
          kind: "start",
          fireKey,
          sendOptions: {
            recipientId: uid,
            type: "calendar_event_start",
            title,
            message,
            data: { calendarEventId: eventId, locationId, eventTypeId },
            channels: chans,
            emailSubject: title,
            emailTemplateFile: "calendar-event-start-email.ejs",
            emailTemplateData: {
              ...detailFields,
              headline: `"${ev.title}" is scheduled to start now.`,
              summaryMessage: `The scheduled start time was ${startShort} (${tz}).`,
              firstName: firstNameById.get(uid) ?? "",
            },
            actionUrl: calendarUrl,
            emailButtonText: "Open calendar",
            smsBody: message.slice(0, 300),
          },
        });
      }
    }
  }
}

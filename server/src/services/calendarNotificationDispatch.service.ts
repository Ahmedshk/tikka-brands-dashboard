import mongoose from "mongoose";
import { CalendarEventModel } from "../models/calendarEvent.model.js";
import { CalendarEventTypeModel } from "../models/calendarEventType.model.js";
import { LocationModel } from "../models/location.model.js";
import { CalendarNotificationLogModel } from "../models/calendarNotificationLog.model.js";
import { CalendarNotificationSettingsService } from "./calendarNotificationSettings.service.js";
import { NotificationService } from "./notification.service.js";
import { listUserIdsForRoleAtLocation } from "./calendarNotificationRecipients.service.js";
import { logger } from "../utils/logger.util.js";
import { loadFirstNamesByUserId } from "../utils/notificationRecipientFirstNames.util.js";
import type {
  NotificationChannel,
  SendNotificationOptions,
} from "../types/notification.types.js";
import { normalizeRoleBindingChannels } from "../utils/calendarRoleBindingChannels.util.js";
import { calendarWallYmd } from "../utils/calendarReminder.util.js";
import {
  buildCalendarEventDetailFields,
  formatShortEventStart,
} from "../utils/calendarEmailTemplate.util.js";
import type { CalendarNotifyKind } from "../utils/calendarNotificationSchedule.util.js";
import type { ICalendarRoleEventBinding } from "../types/calendar.types.js";
import {
  buildHourBeforeNotificationCopy,
  computeMinutesUntilEventStart,
  formatCalendarLocationLine,
} from "../utils/calendarNotificationDispatchHelpers.util.js";

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

type CalendarDispatchEventLean = {
  _id: mongoose.Types.ObjectId;
  title: string;
  start: Date;
  end: Date;
  description?: unknown;
  timeZone?: string;
  locationId: mongoose.Types.ObjectId;
  eventTypeId: mongoose.Types.ObjectId;
};

type CalendarDispatchContext = {
  kind: CalendarNotifyKind;
  fireKey: string;
  now: Date;
  ev: CalendarDispatchEventLean;
  locationId: string;
  eventTypeId: string;
  eventId: string;
  bindings: ICalendarRoleEventBinding[];
  detailFields: Record<string, unknown>;
  calendarUrl: string;
  startShort: string;
  tz: string | undefined;
};

async function loadCalendarDispatchContext(params: {
  calendarEventId: string;
  kind: CalendarNotifyKind;
  fireKey: string;
  now: Date;
}): Promise<CalendarDispatchContext | null> {
  const { calendarEventId, kind, fireKey, now } = params;
  const raw = await CalendarEventModel.findById(calendarEventId).lean();
  if (!raw) {
    logger.debug("calendar:notify-one skip (event deleted)", { calendarEventId, kind, fireKey });
    return null;
  }

  const ev = raw as unknown as CalendarDispatchEventLean;
  const eventStart = ev.start instanceof Date ? ev.start : new Date(ev.start);
  const tzForDay = typeof ev.timeZone === "string" ? ev.timeZone : undefined;
  const todayYmd = calendarWallYmd(now, tzForDay);
  const eventStartYmd = calendarWallYmd(eventStart, tzForDay);
  if (eventStartYmd < todayYmd) {
    logger.info("calendar:notify-one skip (event start calendar date before today in event TZ)", {
      calendarEventId,
      kind,
      fireKey,
      eventStartYmd,
      todayYmd,
      timeZone: tzForDay ?? null,
    });
    return null;
  }

  const settings = await settingsService.get();
  if (!settings.roleEventBindings?.length) {
    return null;
  }

  const locationId = ev.locationId.toString();
  const eventTypeId = ev.eventTypeId.toString();
  const eventId = ev._id.toString();

  const bindings = settings.roleEventBindings.filter(
    (b) => String(b.eventTypeId) === eventTypeId,
  );
  if (bindings.length === 0) {
    return null;
  }

  const typeDoc = await CalendarEventTypeModel.findById(ev.eventTypeId).lean();
  const tz = ev.timeZone;
  const tzForIntl = typeof tz === "string" ? tz : "UTC";
  const locationDoc = await LocationModel.findById(ev.locationId).select("storeName address").lean();
  const locationLine = formatCalendarLocationLine(
    locationDoc as { storeName?: string; address?: string } | null,
  );

  const eventTypeName = typeDoc?.name ?? "Calendar event";
  const eventTypeColorHex = typeDoc?.colorHex ?? "#6B7280";
  const detailFields = buildCalendarEventDetailFields({
    ev: {
      title: ev.title,
      description: typeof ev.description === "string" ? ev.description : "",
      start: ev.start,
      end: ev.end,
      timeZone: tzForIntl,
    },
    eventTypeName,
    eventTypeColorHex,
    locationLine,
  });

  return {
    kind,
    fireKey,
    now,
    ev,
    locationId,
    eventTypeId,
    eventId,
    bindings,
    detailFields,
    calendarUrl: getDashboardCalendarUrl(),
    startShort: formatShortEventStart(ev.start, tzForIntl),
    tz,
  };
}

async function sendCalendarReminderBatch(params: {
  ctx: CalendarDispatchContext;
  userIds: string[];
  chans: NotificationChannel[];
  firstNameById: Map<string, string>;
}): Promise<void> {
  const { ctx, userIds, chans, firstNameById } = params;
  const title = "Upcoming calendar event";
  const message = `Reminder: "${ctx.ev.title}" — ${ctx.startShort} (${ctx.tz}).`;
  for (const uid of userIds) {
    await sendCalendarNotificationWithLogRollback({
      calendarEventId: ctx.eventId,
      userId: uid,
      kind: "reminder",
      fireKey: ctx.fireKey,
      sendOptions: {
        recipientId: uid,
        type: "calendar_event_reminder",
        title,
        message,
        data: { calendarEventId: ctx.eventId, locationId: ctx.locationId, eventTypeId: ctx.eventTypeId },
        channels: chans,
        emailSubject: title,
        emailTemplateFile: "calendar-event-reminder-email.ejs",
        emailTemplateData: {
          ...ctx.detailFields,
          headline: "Reminder: upcoming event",
          summaryMessage: `This is a heads-up for an event on your calendar: "${ctx.ev.title}" at ${ctx.startShort}.`,
          firstName: firstNameById.get(uid) ?? "",
        },
        actionUrl: ctx.calendarUrl,
        emailButtonText: "Open calendar",
        smsBody: message.slice(0, 300),
      },
    });
  }
}

async function sendCalendarHourBeforeBatch(params: {
  ctx: CalendarDispatchContext;
  userIds: string[];
  chans: NotificationChannel[];
  firstNameById: Map<string, string>;
}): Promise<void> {
  const { ctx, userIds, chans, firstNameById } = params;
  const minsUntil = computeMinutesUntilEventStart(ctx.ev.start, ctx.now);
  const copy = buildHourBeforeNotificationCopy({
    evTitle: ctx.ev.title,
    tz: ctx.tz,
    minsUntil,
    startShort: ctx.startShort,
  });
  for (const uid of userIds) {
    await sendCalendarNotificationWithLogRollback({
      calendarEventId: ctx.eventId,
      userId: uid,
      kind: "hour_before",
      fireKey: ctx.fireKey,
      sendOptions: {
        recipientId: uid,
        type: "calendar_event_hour_before",
        title: copy.title,
        message: copy.message,
        data: { calendarEventId: ctx.eventId, locationId: ctx.locationId, eventTypeId: ctx.eventTypeId },
        channels: chans,
        emailSubject: copy.title,
        emailTemplateFile: "calendar-event-hour-before-email.ejs",
        emailTemplateData: {
          ...ctx.detailFields,
          urgencyLine: copy.urgencyLine,
          countdownLine: copy.countdownLine,
          summaryMessage: copy.message,
          firstName: firstNameById.get(uid) ?? "",
        },
        actionUrl: ctx.calendarUrl,
        emailButtonText: "Open calendar",
        smsBody: copy.message.slice(0, 300),
      },
    });
  }
}

async function sendCalendarStartBatch(params: {
  ctx: CalendarDispatchContext;
  userIds: string[];
  chans: NotificationChannel[];
  firstNameById: Map<string, string>;
}): Promise<void> {
  const { ctx, userIds, chans, firstNameById } = params;
  const title = "Event starting now";
  const message = `"${ctx.ev.title}" is scheduled to start now (${ctx.startShort}, ${ctx.tz}).`;
  for (const uid of userIds) {
    await sendCalendarNotificationWithLogRollback({
      calendarEventId: ctx.eventId,
      userId: uid,
      kind: "start",
      fireKey: ctx.fireKey,
      sendOptions: {
        recipientId: uid,
        type: "calendar_event_start",
        title,
        message,
        data: { calendarEventId: ctx.eventId, locationId: ctx.locationId, eventTypeId: ctx.eventTypeId },
        channels: chans,
        emailSubject: title,
        emailTemplateFile: "calendar-event-start-email.ejs",
        emailTemplateData: {
          ...ctx.detailFields,
          headline: `"${ctx.ev.title}" is scheduled to start now.`,
          summaryMessage: `The scheduled start time was ${ctx.startShort} (${ctx.tz}).`,
          firstName: firstNameById.get(uid) ?? "",
        },
        actionUrl: ctx.calendarUrl,
        emailButtonText: "Open calendar",
        smsBody: message.slice(0, 300),
      },
    });
  }
}

async function dispatchCalendarNotificationsForBinding(
  ctx: CalendarDispatchContext,
  binding: ICalendarRoleEventBinding,
): Promise<void> {
  const roleId = String(binding.roleId);
  const userIds = await listUserIdsForRoleAtLocation(roleId, ctx.locationId);
  const chans = channelsToList(normalizeRoleBindingChannels(binding.channels));
  if (chans.length === 0) {
    return;
  }

  const willSendReminder = Boolean(binding.notifyReminders && ctx.kind === "reminder");
  const willSendHourBefore = Boolean(binding.notifyReminders && ctx.kind === "hour_before");
  const willSendStart = Boolean(binding.notifyOnStart && ctx.kind === "start");
  if (!willSendReminder && !willSendHourBefore && !willSendStart) {
    return;
  }

  const firstNameById =
    chans.includes("email") && userIds.length > 0
      ? await loadFirstNamesByUserId(userIds)
      : new Map<string, string>();

  if (willSendReminder) {
    await sendCalendarReminderBatch({ ctx, userIds, chans, firstNameById });
  }
  if (willSendHourBefore) {
    await sendCalendarHourBeforeBatch({ ctx, userIds, chans, firstNameById });
  }
  if (willSendStart) {
    await sendCalendarStartBatch({ ctx, userIds, chans, firstNameById });
  }
}

/**
 * Send calendar notifications for one event, one kind, one fireKey (Agenda calendar:notify-one).
 */
export async function dispatchCalendarNotificationForEvent(params: {
  calendarEventId: string;
  kind: CalendarNotifyKind;
  fireKey: string;
}): Promise<void> {
  const now = new Date();
  const ctx = await loadCalendarDispatchContext({ ...params, now });
  if (!ctx) {
    return;
  }

  for (const binding of ctx.bindings) {
    await dispatchCalendarNotificationsForBinding(ctx, binding);
  }
}

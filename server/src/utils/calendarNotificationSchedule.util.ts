import mongoose from "mongoose";
import { fromZonedTime } from "date-fns-tz";
import { CalendarEventModel } from "../models/calendarEvent.model.js";
import { CalendarEventTypeModel } from "../models/calendarEventType.model.js";
import { CalendarNotificationSettingsService } from "../services/calendarNotificationSettings.service.js";
import { getReminderLocalDates, normalizeHm } from "./calendarReminder.util.js";
import { mergeReminderPolicy } from "./calendarReminderPolicy.util.js";
import type { ICalendarReminderPolicy } from "../types/calendar.types.js";
import { logger } from "./logger.util.js";
import { CALENDAR_NOTIFY_ONE_JOB } from "../constants/calendarAgendaJobs.js";

/** Max days ahead to schedule notification jobs (plan: 90–180). */
const SCHEDULE_HORIZON_DAYS = 120;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type CalendarNotifyKind = "reminder" | "hour_before" | "start";

export type CalendarNotifyOneJobData = {
  calendarEventId: string;
  kind: CalendarNotifyKind;
  fireKey: string;
};

export type CalendarRescheduleBySettingsJobData = {
  eventTypeIds: string[];
};

function reminderInstantUtc(ymd: string, hm: string, timeZone: string): Date {
  return fromZonedTime(`${ymd}T${hm}:00`, timeZone);
}

/** Compute (when, kind, fireKey) for all notification fires for an event. */
export function computeNotificationFireSchedule(params: {
  start: Date;
  timeZone: string;
  policy: ICalendarReminderPolicy;
  now?: Date;
}): Array<{ when: Date; kind: CalendarNotifyKind; fireKey: string }> {
  const now = params.now ?? new Date();
  const { start, timeZone, policy } = params;
  const startMs = start.getTime();
  const nowMs = now.getTime();
  const horizonEnd = nowMs + SCHEDULE_HORIZON_DAYS * MS_PER_DAY;

  if (startMs > horizonEnd || startMs <= nowMs) {
    return [];
  }

  const out: Array<{ when: Date; kind: CalendarNotifyKind; fireKey: string }> = [];
  const reminderHm = normalizeHm(policy.reminderTimeLocal);

  const reminderDates = getReminderLocalDates({
    eventStart: start,
    timeZone,
    mode: policy.mode,
    daysBeforeStart: policy.daysBeforeStart,
  });

  for (const ymd of reminderDates) {
    const when = reminderInstantUtc(ymd, reminderHm, timeZone);
    if (when.getTime() > nowMs && when.getTime() < startMs) {
      out.push({ when, kind: "reminder", fireKey: `reminder-${ymd}` });
    }
  }

  const hourBefore = new Date(startMs - 60 * 60 * 1000);
  if (hourBefore.getTime() > nowMs) {
    out.push({ when: hourBefore, kind: "hour_before", fireKey: "1h" });
  }

  if (startMs > nowMs) {
    out.push({ when: new Date(startMs), kind: "start", fireKey: "at-start" });
  }

  return out;
}

const settingsService = new CalendarNotificationSettingsService();

async function getAgendaSafe(): Promise<import("agenda").Agenda | null> {
  try {
    const { getAgenda } = await import("../config/agenda.js");
    return getAgenda();
  } catch {
    return null;
  }
}

export async function cancelJobsForEvent(calendarEventMongoId: string): Promise<number> {
  try {
    const agenda = await getAgendaSafe();
    if (!agenda) return 0;
    const n = await agenda.cancel({
      name: CALENDAR_NOTIFY_ONE_JOB,
      data: { calendarEventId: calendarEventMongoId },
    });
    if (n > 0) {
      logger.debug("Calendar notification jobs cancelled for event", { calendarEventMongoId, n });
    }
    return n;
  } catch (e) {
    logger.warn("cancelJobsForEvent: agenda not ready or cancel failed", {
      calendarEventMongoId,
      e,
    });
    return 0;
  }
}

export async function scheduleJobsForEvent(calendarEventMongoId: string): Promise<number> {
  let scheduled = 0;
  try {
    const agenda = await getAgendaSafe();
    if (!agenda) return 0;
    const settings = await settingsService.get();
    if (!settings.roleEventBindings?.length) return 0;

    const ev = await CalendarEventModel.findById(calendarEventMongoId).lean();
    if (!ev) return 0;

    const eventTypeId = ev.eventTypeId.toString();
    const bindings = settings.roleEventBindings.filter(
      (b) => String(b.eventTypeId) === eventTypeId,
    );
    if (bindings.length === 0) return 0;

    const typeDoc = await CalendarEventTypeModel.findById(ev.eventTypeId).lean();
    const policy = mergeReminderPolicy(
      typeDoc?.reminderPolicy as Partial<ICalendarReminderPolicy> | undefined,
    );

    const tuples = computeNotificationFireSchedule({
      start: ev.start,
      timeZone: ev.timeZone,
      policy,
    });

    for (const t of tuples) {
      const data: CalendarNotifyOneJobData = {
        calendarEventId: calendarEventMongoId,
        kind: t.kind,
        fireKey: t.fireKey,
      };
      await agenda.schedule(t.when, CALENDAR_NOTIFY_ONE_JOB, data);
      scheduled += 1;
    }

    if (scheduled > 0) {
      logger.debug("Calendar notification jobs scheduled", {
        calendarEventMongoId,
        scheduled,
      });
    }
  } catch (e) {
    logger.warn("scheduleJobsForEvent failed", { calendarEventMongoId, e });
  }
  return scheduled;
}

export async function rescheduleNotificationJobsForEvent(calendarEventMongoId: string): Promise<void> {
  await cancelJobsForEvent(calendarEventMongoId);
  await scheduleJobsForEvent(calendarEventMongoId);
}

/** Reschedule all future events that use any of the given event type IDs. */
export async function rescheduleFutureEventsForEventTypeIds(eventTypeIds: string[]): Promise<{
  eventsProcessed: number;
  jobsScheduled: number;
}> {
  if (eventTypeIds.length === 0) return { eventsProcessed: 0, jobsScheduled: 0 };

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + SCHEDULE_HORIZON_DAYS * MS_PER_DAY);
  const oids = eventTypeIds.map((id) => new mongoose.Types.ObjectId(id));

  const ids = await CalendarEventModel.find({
    eventTypeId: { $in: oids },
    start: { $gt: now, $lte: horizonEnd },
  })
    .select("_id")
    .lean();

  let jobsScheduled = 0;
  for (const row of ids) {
    const id = row._id.toString();
    await cancelJobsForEvent(id);
    jobsScheduled += await scheduleJobsForEvent(id);
  }

  return { eventsProcessed: ids.length, jobsScheduled };
}

const BACKFILL_CHUNK = 100;

/** One-shot: reschedule notification jobs for all future events within the schedule horizon. */
export async function backfillAllFutureNotificationJobs(): Promise<{
  eventsProcessed: number;
  jobsScheduled: number;
}> {
  const now = new Date();
  const horizonEnd = new Date(now.getTime() + SCHEDULE_HORIZON_DAYS * MS_PER_DAY);

  let eventsProcessed = 0;
  let jobsScheduled = 0;
  let lastId: mongoose.Types.ObjectId | null = null;

  for (;;) {
    const q: Record<string, unknown> = {
      start: { $gt: now, $lte: horizonEnd },
    };
    if (lastId) q._id = { $gt: lastId };

    const batch = await CalendarEventModel.find(q)
      .select("_id")
      .sort({ _id: 1 })
      .limit(BACKFILL_CHUNK)
      .lean();

    if (batch.length === 0) break;

    for (const row of batch) {
      const id = row._id.toString();
      await cancelJobsForEvent(id);
      jobsScheduled += await scheduleJobsForEvent(id);
      eventsProcessed += 1;
      lastId = row._id;
    }

    if (batch.length < BACKFILL_CHUNK) break;
  }

  return { eventsProcessed, jobsScheduled };
}

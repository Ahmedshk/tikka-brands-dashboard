import type { Agenda } from "agenda";
import { CalendarEventService } from "../services/calendarEvent.service.js";
import { dispatchCalendarNotificationForEvent } from "../services/calendarNotificationDispatch.service.js";
import { logger } from "../utils/logger.util.js";
import { isTestMode } from "../utils/reviewTimings.js";
import {
  backfillAllFutureNotificationJobs,
  rescheduleFutureEventsForEventTypeIds,
} from "../utils/calendarNotificationSchedule.util.js";
import type {
  CalendarNotifyOneJobData,
  CalendarRescheduleBySettingsJobData,
} from "../utils/calendarNotificationSchedule.util.js";
import {
  CALENDAR_BACKFILL_NOTIFICATION_JOBS,
  CALENDAR_NOTIFY_ONE_JOB,
  CALENDAR_RESCHEDULE_BY_SETTINGS_JOB,
} from "../constants/calendarAgendaJobs.js";

const calendarEventService = new CalendarEventService();

export function registerCalendarJobs(agenda: Agenda): void {
  agenda.define("calendar:reconcile", async () => {
    logger.info("Job: calendar:reconcile - running");
    try {
      const now = new Date();
      const timeMin = new Date(now);
      timeMin.setMonth(timeMin.getMonth() - 2);
      const timeMax = new Date(now);
      timeMax.setMonth(timeMax.getMonth() + 6);
      const { upserted, rescheduled } = await calendarEventService.reconcileRange(timeMin, timeMax);
      logger.info("Job: calendar:reconcile - done", { upserted, rescheduled });
    } catch (err) {
      logger.error("Job: calendar:reconcile failed", { err });
    }
  });

  agenda.define(
    CALENDAR_NOTIFY_ONE_JOB,
    async (job) => {
      const data = job.attrs.data as CalendarNotifyOneJobData | undefined;
      if (!data?.calendarEventId || !data.kind || !data.fireKey) {
        logger.warn("calendar:notify-one missing data", { data });
        return;
      }
      await dispatchCalendarNotificationForEvent({
        calendarEventId: data.calendarEventId,
        kind: data.kind,
        fireKey: data.fireKey,
      });
    },
    { priority: "high", removeOnComplete: true },
  );

  agenda.define(CALENDAR_RESCHEDULE_BY_SETTINGS_JOB, async (job) => {
    const data = job.attrs.data as CalendarRescheduleBySettingsJobData | undefined;
    const eventTypeIds = data?.eventTypeIds ?? [];
    logger.info("Job: calendar:reschedule-by-settings - running", {
      eventTypeCount: eventTypeIds.length,
    });
    try {
      const { eventsProcessed, jobsScheduled } =
        await rescheduleFutureEventsForEventTypeIds(eventTypeIds);
      logger.info("Job: calendar:reschedule-by-settings - done", {
        eventsProcessed,
        jobsScheduled,
      });
    } catch (err) {
      logger.error("Job: calendar:reschedule-by-settings failed", { err });
    }
  });

  agenda.define(CALENDAR_BACKFILL_NOTIFICATION_JOBS, async () => {
    logger.info("Job: calendar:backfill-notification-jobs - running");
    try {
      const { eventsProcessed, jobsScheduled } = await backfillAllFutureNotificationJobs();
      logger.info("Job: calendar:backfill-notification-jobs - done", {
        eventsProcessed,
        jobsScheduled,
      });
    } catch (err) {
      logger.error("Job: calendar:backfill-notification-jobs failed", { err });
    }
  });
}

/** Fire-and-forget backfill after Agenda is up (existing future events). */
export function queueCalendarNotificationBackfill(agenda: Agenda): void {
  if (isTestMode()) return;
  void agenda
    .now(CALENDAR_BACKFILL_NOTIFICATION_JOBS)
    .then(() => logger.info("Agenda: queued calendar:backfill-notification-jobs"))
    .catch((err) => logger.warn("Agenda: could not queue calendar backfill", { err }));
}

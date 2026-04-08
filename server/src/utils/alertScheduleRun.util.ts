import type { IAlertRunSchedule } from "../types/alertNotification.types.js";
import { getLocalTimeHmInTimezone, normalizeHm } from "./alertTime.util.js";

export function intervalMinutesForSchedule(schedule: IAlertRunSchedule): number {
  return Math.max(1, schedule.interval.hours * 60 + schedule.interval.minutes);
}

/** True once per interval when the repeating job ticks every minute (bucket boundary crossed). */
export function shouldRunIntervalPhase(intervalMinutes: number, nowMs: number = Date.now()): boolean {
  const bucketMs = intervalMinutes * 60_000;
  const b = Math.floor(nowMs / bucketMs);
  const bPrev = Math.floor((nowMs - 60_000) / bucketMs);
  return b !== bPrev;
}

/**
 * Whether this alert rule should be evaluated on the current Agenda tick (1 min in prod).
 * Fixed times: local HM matches one of configured times for the location timezone.
 * Interval: bucket boundary per rule's interval.
 */
export function shouldRunAlertScheduleTick(
  schedule: IAlertRunSchedule,
  timezone: string,
  nowMs: number = Date.now(),
): boolean {
  if (schedule.scheduleMode === "fixed_times") {
    const hm = getLocalTimeHmInTimezone(timezone);
    const targets = schedule.fixedTimesLocal.map((t) => normalizeHm(t));
    return targets.includes(normalizeHm(hm));
  }
  return shouldRunIntervalPhase(intervalMinutesForSchedule(schedule), nowMs);
}

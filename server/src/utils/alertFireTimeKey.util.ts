import type { IAlertRunSchedule } from "../types/alertNotification.types.js";
import { getLocalTimeHmInTimezoneAt, normalizeHm } from "./alertTime.util.js";
import { getTodayInTimezoneAt } from "./timezone.util.js";

export function buildFireTimeKey(
  schedule: IAlertRunSchedule,
  timezone: string,
  intervalMinutes: number,
  nowMs: number,
): string {
  const day = getTodayInTimezoneAt(timezone, nowMs);
  if (schedule.scheduleMode === "interval") {
    const bucket = Math.floor(nowMs / (intervalMinutes * 60 * 1000));
    return `${day}|i${bucket}`;
  }
  const hm = getLocalTimeHmInTimezoneAt(timezone, nowMs);
  return `${day}|t${normalizeHm(hm)}`;
}

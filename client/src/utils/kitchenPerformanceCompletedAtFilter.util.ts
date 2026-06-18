import { formatInTimeZone } from "date-fns-tz";
import type { KitchenPerformanceTicketRow } from "../types/kitchenPerformance.types";

export interface KitchenPerformanceCompletedAtRange {
  start: string;
  end: string;
}

function parseDisplayInstant(value: string | null): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value.trim().replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function hasActiveCompletedAtFilter(
  range: KitchenPerformanceCompletedAtRange,
): boolean {
  return range.start.trim() !== "" && range.end.trim() !== "";
}

/** Parses `HH:mm` (24-hour) to minutes since midnight. */
export function parseHmToMinutes(hm: string): number | null {
  const trimmed = hm.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hourPart = match[1];
  const minutePart = match[2];
  if (hourPart == null || minutePart == null) return null;
  const hours = Number.parseInt(hourPart, 10);
  const minutes = Number.parseInt(minutePart, 10);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

export function getCompletedAtMinutesInTimezone(
  timeCompleted: string | null,
  timezone: string,
): number | null {
  const parsed = parseDisplayInstant(timeCompleted);
  if (!parsed) return null;
  const tz = timezone.trim();
  const hourStr = formatInTimeZone(parsed, tz, "H");
  const minuteStr = formatInTimeZone(parsed, tz, "m");
  const hours = Number.parseInt(hourStr, 10);
  const minutes = Number.parseInt(minuteStr, 10);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

function isMinuteInRange(
  valueMinutes: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  if (startMinutes <= endMinutes) {
    return valueMinutes >= startMinutes && valueMinutes <= endMinutes;
  }
  return valueMinutes >= startMinutes || valueMinutes <= endMinutes;
}

export function isTicketCompletedInRange(
  row: Pick<KitchenPerformanceTicketRow, "timeCompleted">,
  range: KitchenPerformanceCompletedAtRange,
  timezone: string,
): boolean {
  if (!hasActiveCompletedAtFilter(range)) return true;

  const startMinutes = parseHmToMinutes(range.start);
  const endMinutes = parseHmToMinutes(range.end);
  if (startMinutes == null || endMinutes == null) return false;

  const completedMinutes = getCompletedAtMinutesInTimezone(row.timeCompleted, timezone);
  if (completedMinutes == null) return false;

  return isMinuteInRange(completedMinutes, startMinutes, endMinutes);
}

export function validateCompletedAtFilterForApply(
  start: string,
  end: string,
  options?: { startComplete?: boolean; endComplete?: boolean },
): { error: string | null } {
  const startComplete =
    options?.startComplete ?? parseHmToMinutes(start.trim()) != null;
  const endComplete = options?.endComplete ?? parseHmToMinutes(end.trim()) != null;

  if (!startComplete && !endComplete) {
    return {
      error: "Complete both the start and end times (hour, minute, and AM/PM).",
    };
  }
  if (!startComplete) {
    return {
      error: "Complete the start time (hour, minute, and AM/PM).",
    };
  }
  if (!endComplete) {
    return {
      error: "Complete the end time (hour, minute, and AM/PM).",
    };
  }

  const startTrimmed = start.trim();
  const endTrimmed = end.trim();
  if (parseHmToMinutes(startTrimmed) == null) {
    return { error: "Start time is invalid." };
  }
  if (parseHmToMinutes(endTrimmed) == null) {
    return { error: "End time is invalid." };
  }
  return { error: null };
}

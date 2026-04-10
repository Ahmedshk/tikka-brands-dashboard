import { addDays, format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { CalendarReminderMode } from "../types/calendar.types.js";

function shiftYmd(ymd: string, deltaDays: number): string {
  const base = parseISO(`${ymd}T12:00:00Z`);
  return format(addDays(base, deltaDays), "yyyy-MM-dd");
}

/** Local calendar dates (yyyy-MM-dd in `timeZone`) when a reminder should fire. */
export function getReminderLocalDates(params: {
  eventStart: Date;
  timeZone: string;
  mode: CalendarReminderMode;
  daysBeforeStart: number;
}): string[] {
  const startYmd = formatInTimeZone(params.eventStart, params.timeZone, "yyyy-MM-dd");
  const n = params.daysBeforeStart;
  if (n <= 0) return [];

  if (params.mode === "single") {
    return [shiftYmd(startYmd, -n)];
  }

  const out: string[] = [];
  for (let i = n; i >= 1; i -= 1) {
    out.push(shiftYmd(startYmd, -i));
  }
  return out;
}

export function localDateInZone(now: Date, timeZone: string): string {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

/**
 * Calendar date (yyyy-MM-dd) for an instant in `timeZone`, comparable lexicographically.
 * Falls back to UTC when timezone is missing or invalid (matches event wall-time semantics when TZ is set).
 */
export function calendarWallYmd(instant: Date, timeZone: string | undefined): string {
  const tz = timeZone?.trim();
  if (!tz) {
    return formatInTimeZone(instant, "UTC", "yyyy-MM-dd");
  }
  try {
    return formatInTimeZone(instant, tz, "yyyy-MM-dd");
  } catch {
    return formatInTimeZone(instant, "UTC", "yyyy-MM-dd");
  }
}

export function localHmInZone(now: Date, timeZone: string): string {
  return formatInTimeZone(now, timeZone, "HH:mm");
}

/** True if `now` is in the same calendar minute as `instant` (UTC instant). */
export function isInstantInThisMinute(instant: Date, now: Date): boolean {
  const t0 = instant.getTime();
  const t1 = now.getTime();
  return t1 >= t0 && t1 < t0 + 60_000;
}

/** True if `now` is in the same minute as event start (for one-shot start notification). */
export function isEventStartMinute(eventStart: Date, now: Date): boolean {
  return isInstantInThisMinute(eventStart, now);
}

/**
 * True during the whole hour before `eventStart` (exclusive of start): [start−1h, start).
 * The old 60s UTC slice missed sends when Agenda ran late. First job tick in this window
 * triggers send; CalendarNotificationLog dedupes (kind hour_before, fireKey "1h").
 */
export function isOneHourBeforeNotificationDue(eventStart: Date, now: Date): boolean {
  const startMs = eventStart.getTime();
  const nowMs = now.getTime();
  if (nowMs >= startMs) return false;
  const hourBeforeMs = startMs - 60 * 60 * 1000;
  return nowMs >= hourBeforeMs;
}

/** True if `now` is in the minute exactly one hour before `eventStart` (narrow; easy to miss). */
export function isOneHourBeforeEventMinute(eventStart: Date, now: Date): boolean {
  const hourBefore = new Date(eventStart.getTime() - 60 * 60 * 1000);
  return isInstantInThisMinute(hourBefore, now);
}

export function normalizeHm(hm: string): string {
  const [h, m] = hm.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return "00:00";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Calendar "today" in `timeZone` (IANA), as UTC `Date` bounds for local midnight…23:59:59.999.
 * Used for Square payments/orders and Homebase timecards when syncing "today" per store.
 */
export function getZonedCalendarDayUtcBounds(
  timeZone: string,
  referenceUtc: Date = new Date(),
): { start: Date; end: Date } {
  const tz = timeZone.trim() || "America/Denver";
  const dayStr = formatInTimeZone(referenceUtc, tz, "yyyy-MM-dd");
  return getZonedCalendarDayUtcBoundsForDateKey(tz, dayStr);
}

/**
 * UTC bounds for a calendar date `yyyy-MM-dd` interpreted in `timeZone` (local midnight through 23:59:59.999).
 * Used for daily rollups aligned with zoned "calendar day" sync windows.
 */
export function getZonedCalendarDayUtcBoundsForDateKey(
  timeZone: string,
  businessDateKey: string,
): { start: Date; end: Date } {
  const tz = timeZone.trim() || "America/Denver";
  const key = businessDateKey.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw new Error(`Invalid businessDateKey (expected yyyy-MM-dd): ${businessDateKey}`);
  }
  const start = fromZonedTime(`${key}T00:00:00.000`, tz);
  const end = fromZonedTime(`${key}T23:59:59.999`, tz);
  return { start, end };
}

import { formatYmdInTimezone } from "./timezone.util.js";
import { iterBusinessDateKeysInclusive } from "./rollupScriptArgs.util.js";

/**
 * Sorted unique `yyyy-MM-dd` business keys from the calendar date of `startAt`
 * through the calendar date of `endAt` in `timeZone` (IANA), inclusive.
 */
export function businessDateKeysForUtcRange(
  startAt: string | Date,
  endAt: string | Date,
  timeZone: string,
): string[] {
  const tz = timeZone.trim() || "UTC";
  const start = typeof startAt === "string" ? new Date(startAt) : startAt;
  const end = typeof endAt === "string" ? new Date(endAt) : endAt;
  // `formatYmdInTimezone` uses the process-wide cached `Intl.DateTimeFormat`,
  // avoiding the per-call ICU formatter allocation that `formatInTimeZone`
  // from date-fns-tz incurs. Equivalent output for valid Dates.
  const fromKey = formatYmdInTimezone(start, tz);
  const toKey = formatYmdInTimezone(end, tz);
  return iterBusinessDateKeysInclusive(fromKey, toKey);
}

import { formatInTimeZone } from "date-fns-tz";
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
  const fromKey = formatInTimeZone(start, tz, "yyyy-MM-dd");
  const toKey = formatInTimeZone(end, tz, "yyyy-MM-dd");
  return iterBusinessDateKeysInclusive(fromKey, toKey);
}

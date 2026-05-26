import { formatYmdInTimezone, getStartOfDayUtc } from "./timezone.util.js";
import {
  parseYmdBusinessDateKey,
  previousYmdInTimezone,
} from "./businessDayUtcRange.util.js";

/** Next calendar yyyy-MM-dd in `timeZone` (≈24h after local midnight of `ymd`). */
export function nextYmdInTimezone(ymd: string, timeZone: string): string {
  const tz = timeZone.trim() || "UTC";
  const { y, m0, d } = parseYmdBusinessDateKey(ymd);
  const startOfYmd = getStartOfDayUtc(y, m0, d, tz);
  const probe = new Date(startOfYmd.getTime() + 24 * 60 * 60 * 1000);
  // Uses the cached `Intl.DateTimeFormat` via `formatYmdInTimezone` instead of
  // `formatInTimeZone(...)` from date-fns-tz — equivalent output for valid
  // Dates with `yyyy-MM-dd` format, but avoids the per-call ICU formatter
  // allocation that was a contributor to the dashboard hot-path slowness.
  return formatYmdInTimezone(probe, tz);
}

export function addDaysToYmd(ymd: string, tz: string, deltaDays: number): string {
  let k = ymd;
  const steps = Math.abs(deltaDays);
  for (let i = 0; i < steps; i++) {
    k =
      deltaDays >= 0
        ? nextYmdInTimezone(k, tz)
        : previousYmdInTimezone(k, tz);
  }
  return k;
}

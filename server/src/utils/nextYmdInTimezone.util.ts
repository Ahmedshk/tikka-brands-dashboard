import { formatYmdInTimezone } from "./timezone.util.js";
import {
  parseYmdBusinessDateKey,
  previousYmdInTimezone,
} from "./businessDayUtcRange.util.js";

/**
 * Next calendar yyyy-MM-dd in `timeZone`.
 *
 * IMPORTANT — DST CORRECTNESS:
 * The naive implementation ("start of local midnight + 24h") infinite-loops
 * on fall-back DST days for callers that walk a month by calling this
 * repeatedly (e.g. `businessDateKeysForMonthPeriod`). On Nov 2 in
 * America/Denver, midnight MDT is 06:00Z; adding 24h gives 06:00Z on Nov 3,
 * but by then the zone has fallen back to MST (UTC-7), so 06:00Z is 23:00
 * MST on Nov 2 — STILL the same local date. The function would return
 * "2025-11-02" given "2025-11-02", and the caller's
 * `while (k.startsWith(prefix))` loop would never advance, hanging the
 * Square / Homebase rollup script for any month containing the fall-back
 * transition.
 *
 * Fix: advance the civil date components directly (`d + 1`) and anchor the
 * probe instant at NOON UTC of that target date. Noon UTC is at least ~10h
 * away from any IANA-recognized DST transition, so the formatted local date
 * is unambiguous in every timezone we care about.
 *
 * `formatYmdInTimezone` is the cached-`Intl.DateTimeFormat` variant — same
 * output as `date-fns-tz` `formatInTimeZone` but avoids the per-call ICU
 * allocation that was a contributor to dashboard hot-path slowness.
 */
export function nextYmdInTimezone(ymd: string, timeZone: string): string {
  const tz = timeZone.trim() || "UTC";
  const { y, m0, d } = parseYmdBusinessDateKey(ymd);
  const probe = new Date(Date.UTC(y, m0, d + 1, 12, 0, 0, 0));
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

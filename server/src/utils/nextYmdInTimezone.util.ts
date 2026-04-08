import { formatInTimeZone } from "date-fns-tz";
import { getStartOfDayUtc } from "./timezone.util.js";
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
  return formatInTimeZone(probe, tz, "yyyy-MM-dd");
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

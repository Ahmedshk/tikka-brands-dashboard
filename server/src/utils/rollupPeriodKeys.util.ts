import { getStartOfDayUtc } from "./timezone.util.js";
import {
  parseYmdBusinessDateKey,
  previousYmdInTimezone,
} from "./businessDayUtcRange.util.js";
import { addDaysToYmd, nextYmdInTimezone } from "./nextYmdInTimezone.util.js";
import { iterBusinessDateKeysInclusive } from "./rollupScriptArgs.util.js";

export function weekdayShortInTimezone(ymd: string, tz: string): string {
  const { y, m0, d } = parseYmdBusinessDateKey(ymd);
  const start = getStartOfDayUtc(y, m0, d, tz.trim() || "UTC");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz.trim() || "UTC",
    weekday: "short",
  }).format(start);
}

/** Sunday-start week: `periodKey` = Sunday's yyyy-MM-dd in location TZ (matches goals / WTD). */
export function sundayWeekStartYmdForBusinessDateKey(
  businessDateKey: string,
  tz: string,
): string {
  const timezone = tz.trim() || "UTC";
  let key = businessDateKey;
  for (let i = 0; i < 7; i++) {
    if (weekdayShortInTimezone(key, timezone) === "Sun") return key;
    key = previousYmdInTimezone(key, timezone);
  }
  return businessDateKey;
}

export function monthPeriodKeyFromBusinessDateKey(
  businessDateKey: string,
): string {
  return businessDateKey.slice(0, 7);
}

export function yearPeriodKeyFromBusinessDateKey(
  businessDateKey: string,
): string {
  return businessDateKey.slice(0, 4);
}

/** Inclusive yyyy-MM-dd list for Sunday–Saturday week in TZ. */
export function businessDateKeysForWeekPeriod(
  weekStartSundayYmd: string,
  tz: string,
): string[] {
  const timezone = tz.trim() || "UTC";
  const end = addDaysToYmd(weekStartSundayYmd, timezone, 6);
  return iterBusinessDateKeysInclusive(weekStartSundayYmd, end);
}

/** All calendar days in month `yyyy-MM` (approximate via iteration). */
export function businessDateKeysForMonthPeriod(
  monthPeriodKey: string,
  tz: string,
): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(monthPeriodKey.trim());
  if (!m) return [];
  const prefix = `${m[1]}-${m[2]}-`;
  const timezone = tz.trim() || "UTC";
  let k = `${m[1]}-${m[2]}-01`;
  const keys: string[] = [];
  while (k.startsWith(prefix)) {
    keys.push(k);
    k = nextYmdInTimezone(k, timezone);
  }
  return keys;
}

export function businessDateKeysForYearPeriod(
  yearPeriodKey: string,
  _tz: string,
): string[] {
  const y = yearPeriodKey.trim();
  if (!/^\d{4}$/.test(y)) return [];
  const startKey = `${y}-01-01`;
  const endKey = `${y}-12-31`;
  return iterBusinessDateKeysInclusive(startKey, endKey);
}

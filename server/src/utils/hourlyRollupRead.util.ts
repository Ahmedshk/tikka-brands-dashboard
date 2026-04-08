/**
 * Map sales-trend hourly chart keys (`yyyy-MM-ddTHH`, wall-clock in location TZ)
 * to SquareOrderHourlyRollup coordinates (`businessDateKey` + business slot 0–23).
 */
import {
  businessDateKeyForInstant,
  getBusinessHourIndexForBusinessDateKey,
} from "./businessDayUtcRange.util.js";
import { getStartOfDayUtc } from "./timezone.util.js";

const MS_PER_HOUR = 60 * 60 * 1000;

const HOURLY_CHART_KEY = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/;

/**
 * Parse a chart key from {@link buildHourlyBuckets} / {@link getBucketKeyForDate} hourly mode.
 */
export function parseHourlySalesTrendChartKey(
  key: string,
): { y: number; m0: number; d: number; hour: number } | null {
  const m = HOURLY_CHART_KEY.exec(key.trim());
  if (!m) return null;
  const y = Number.parseInt(m[1]!, 10);
  const mo = Number.parseInt(m[2]!, 10) - 1;
  const d = Number.parseInt(m[3]!, 10);
  const hour = Number.parseInt(m[4]!, 10);
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    !Number.isFinite(hour) ||
    hour < 0 ||
    hour > 23
  ) {
    return null;
  }
  return { y, m0: mo, d, hour };
}

/**
 * Wall-clock start of that chart hour as UTC `Date`, matching {@link buildHourlyBuckets} stepping.
 */
export function wallClockHourStartUtc(
  key: string,
  timezone: string,
): Date | null {
  const parsed = parseHourlySalesTrendChartKey(key);
  if (!parsed) return null;
  const tz = timezone.trim() || "UTC";
  const dayStart = getStartOfDayUtc(parsed.y, parsed.m0, parsed.d, tz);
  return new Date(dayStart.getTime() + parsed.hour * MS_PER_HOUR);
}

export function mapHourlyChartKeyToRollupSlot(
  chartKey: string,
  timezone: string,
  businessStartTime: string,
): { businessDateKey: string; slotIndex: number } | null {
  const instant = wallClockHourStartUtc(chartKey, timezone);
  if (!instant || Number.isNaN(instant.getTime())) return null;
  const tz = timezone.trim() || "UTC";
  const bst = (businessStartTime ?? "00:00").trim() || "00:00";
  const iso = instant.toISOString();
  const businessDateKey = businessDateKeyForInstant(instant, tz, bst);
  const slotIndex = getBusinessHourIndexForBusinessDateKey(
    iso,
    tz,
    bst,
    businessDateKey,
  );
  if (slotIndex < 0 || slotIndex > 23) return null;
  return { businessDateKey, slotIndex };
}

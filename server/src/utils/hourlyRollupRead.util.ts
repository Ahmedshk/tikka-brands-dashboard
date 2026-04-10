/**
 * Map sales-trend hourly chart keys (`yyyy-MM-ddTHH`, wall-clock in location TZ)
 * to SquareOrderHourlyRollup coordinates (`businessDateKey` + business slot 0–23).
 */
import {
  businessDateKeyForInstant,
  getBusinessHourIndexForBusinessDateKey,
} from "./businessDayUtcRange.util.js";
import {
  parseYmdHourFromChartKey,
  wallClockHourStartUtcFromChartKey,
} from "./wallClockHourStart.util.js";

/**
 * Parse a chart key from {@link buildHourlyBuckets} / {@link getBucketKeyForDate} hourly mode.
 */
export function parseHourlySalesTrendChartKey(
  key: string,
): { y: number; m0: number; d: number; hour: number } | null {
  const p = parseYmdHourFromChartKey(key);
  if (!p) return null;
  return { y: p.y, m0: p.m0, d: p.d, hour: p.hour };
}

/**
 * Wall-clock start of that chart hour as UTC `Date`, matching {@link buildHourlyBuckets} stepping.
 */
export function wallClockHourStartUtc(
  key: string,
  timezone: string,
): Date | null {
  return wallClockHourStartUtcFromChartKey(key, timezone);
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

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

/**
 * Process-level memo for `mapHourlyChartKeyToRollupSlot`.
 *
 * Each call into the underlying chain does 2–3 `Intl.DateTimeFormat`
 * operations via date-fns-tz (`fromZonedTime`, `formatInTimeZone`,
 * `businessDayUtcRangeIsoStrings`). The all-locations dashboard fan-out
 * calls this once per chart key per range per location per endpoint —
 * ~1800 invocations per page load, each costing 2–5ms of CPU on Node.
 * On a single-threaded event loop that compounds into seconds of blocking
 * time even when every Mongo call is a cache hit.
 *
 * The result depends only on (chartKey, timezone, businessStartTime). The
 * mapping never changes for stable inputs, so a permanent in-process memo
 * is safe and trivially correct.
 */
type SlotResult = { businessDateKey: string; slotIndex: number } | null;
const slotMemo = new Map<string, SlotResult>();
const SLOT_MEMO_MAX = 50_000;

export function mapHourlyChartKeyToRollupSlot(
  chartKey: string,
  timezone: string,
  businessStartTime: string,
): SlotResult {
  const tz = timezone.trim() || "UTC";
  const bst = (businessStartTime ?? "00:00").trim() || "00:00";
  const key = `${chartKey}|${tz}|${bst}`;
  const memoed = slotMemo.get(key);
  if (memoed !== undefined) return memoed;

  const instant = wallClockHourStartUtc(chartKey, tz);
  if (!instant || Number.isNaN(instant.getTime())) {
    if (slotMemo.size < SLOT_MEMO_MAX) slotMemo.set(key, null);
    return null;
  }
  const iso = instant.toISOString();
  const businessDateKey = businessDateKeyForInstant(instant, tz, bst);
  const slotIndex = getBusinessHourIndexForBusinessDateKey(
    iso,
    tz,
    bst,
    businessDateKey,
  );
  if (slotIndex < 0 || slotIndex > 23) {
    if (slotMemo.size < SLOT_MEMO_MAX) slotMemo.set(key, null);
    return null;
  }
  const result: SlotResult = { businessDateKey, slotIndex };
  if (slotMemo.size < SLOT_MEMO_MAX) slotMemo.set(key, result);
  return result;
}

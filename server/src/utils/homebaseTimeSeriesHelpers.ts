/**
 * Helpers for aggregating Homebase timecards into time-series buckets (labor cost & hours).
 * Extracted to keep cognitive complexity low in homebase.service.
 */
import {
  getBucketKeyForDate,
  type SalesTrendGranularity,
} from "./homebaseOrderedBuckets.util.js";

export interface TimecardForTimeSeries {
  clock_in?: string;
  labor?: {
    costs?: number;
    paid_hours?: number;
    regular_hours?: number;
  };
}

function getHoursFromLabor(labor: TimecardForTimeSeries["labor"]): number {
  if (typeof labor?.paid_hours === "number" && Number.isFinite(labor.paid_hours)) {
    return labor.paid_hours;
  }
  if (typeof labor?.regular_hours === "number" && Number.isFinite(labor.regular_hours)) {
    return labor.regular_hours;
  }
  return 0;
}

/**
 * Aggregate timecards into laborCostByKey and hoursByKey by bucket (key from clock_in + granularity).
 * Mutates laborCostByKey and hoursByKey; keys must already exist on both maps.
 */
export function aggregateTimecardsIntoBuckets(
  timecards: TimecardForTimeSeries[],
  keys: string[],
  timezone: string,
  granularity: SalesTrendGranularity,
  laborCostByKey: Record<string, number>,
  hoursByKey: Record<string, number>,
): void {
  const keySet = new Set(keys);
  for (const tc of timecards) {
    const clockIn = tc.clock_in ? new Date(tc.clock_in) : null;
    if (!clockIn || Number.isNaN(clockIn.getTime())) continue;
    const key = getBucketKeyForDate(clockIn, timezone, granularity);
    if (!key || !keySet.has(key)) continue;

    const costs = tc.labor?.costs;
    if (typeof costs === "number" && Number.isFinite(costs)) {
      laborCostByKey[key] = (laborCostByKey[key] ?? 0) + costs;
    }

    const hours = getHoursFromLabor(tc.labor);
    hoursByKey[key] = (hoursByKey[key] ?? 0) + hours;
  }
}

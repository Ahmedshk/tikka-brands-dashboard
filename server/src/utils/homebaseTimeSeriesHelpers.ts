/**
 * Helpers for aggregating Homebase timecards into time-series buckets (labor cost & hours).
 * Extracted to keep cognitive complexity low in homebase.service.
 */
import {
  getBucketKeyForDate,
  type SalesTrendGranularity,
} from "./homebaseOrderedBuckets.util.js";
import { getStartOfDayUtc } from "./salesTrendDateRange.util.js";

export interface TimecardForTimeSeries {
  clock_in?: string;
  clock_out?: string | null;
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

/** Local calendar parts for an instant (same pattern as buildHourlyBuckets). */
function getLocalHourPartsForTz(date: Date, tz: string) {
  const hourPartsF = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = hourPartsF.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    y: Number.parseInt(get("year"), 10),
    m: Number.parseInt(get("month"), 10) - 1,
    d: Number.parseInt(get("day"), 10),
    h: Number.parseInt(get("hour"), 10),
  };
}

function startOfLocalHourContaining(date: Date, tz: string): Date {
  const { y, m, d, h } = getLocalHourPartsForTz(date, tz);
  const dayStart = getStartOfDayUtc(y, m, d, tz);
  return new Date(dayStart.getTime() + h * 60 * 60 * 1000);
}

/** Next calendar hour start in TZ (DST-safe; mirrors buildHourlyBuckets advance). */
function advanceLocalHourStart(cursor: Date, tz: string): Date {
  const next = new Date(cursor.getTime() + 60 * 60 * 1000);
  const { y, m, d, h } = getLocalHourPartsForTz(next, tz);
  const dayStart = getStartOfDayUtc(y, m, d, tz);
  return new Date(dayStart.getTime() + h * 60 * 60 * 1000);
}

/**
 * Shift end for proration: wall clock when possible, else synthetic from paid hours.
 * Returns null → caller uses single-bucket fallback at clock_in.
 */
function resolveShiftEndMs(
  tc: TimecardForTimeSeries,
  clockInMs: number,
  hours: number,
): number | null {
  const outMs = tc.clock_out ? new Date(tc.clock_out).getTime() : Number.NaN;
  if (Number.isFinite(outMs) && outMs > clockInMs) {
    return outMs;
  }
  if (hours > 0) {
    return clockInMs + hours * 3600 * 1000;
  }
  return null;
}

const MAX_HOUR_STEPS_PER_TIMECARD = 72;

interface HourlyProrationParams {
  keySet: Set<string>;
  tz: string;
  clockInMs: number;
  shiftEndMs: number;
  hours: number;
  costs: number;
  hasFiniteCost: boolean;
  laborCostByKey: Record<string, number>;
  hoursByKey: Record<string, number>;
}

function addOneHourOverlapContribution(
  p: HourlyProrationParams,
  cursor: Date,
  nextCursor: Date,
  spanMs: number,
): void {
  const hourStartMs = cursor.getTime();
  const hourEndMs = nextCursor.getTime();
  const overlapStart = Math.max(p.clockInMs, hourStartMs);
  const overlapEnd = Math.min(p.shiftEndMs, hourEndMs);
  const overlapMs = Math.max(0, overlapEnd - overlapStart);
  if (overlapMs <= 0) return;

  const bucketKey = getBucketKeyForDate(cursor, p.tz, "hourly");
  if (!bucketKey || !p.keySet.has(bucketKey)) return;

  const frac = overlapMs / spanMs;
  if (p.hours > 0) {
    p.hoursByKey[bucketKey] = (p.hoursByKey[bucketKey] ?? 0) + p.hours * frac;
  }
  if (p.hasFiniteCost) {
    p.laborCostByKey[bucketKey] = (p.laborCostByKey[bucketKey] ?? 0) + p.costs * frac;
  }
}

function addProratedHoursAndCostToHourlyBuckets(p: HourlyProrationParams): void {
  const spanMs = Math.max(p.shiftEndMs - p.clockInMs, 1);
  let cursor = startOfLocalHourContaining(new Date(p.clockInMs), p.tz);
  let steps = 0;

  while (cursor.getTime() < p.shiftEndMs && steps < MAX_HOUR_STEPS_PER_TIMECARD) {
    steps += 1;
    const hourStartMs = cursor.getTime();
    const nextCursor = advanceLocalHourStart(cursor, p.tz);
    addOneHourOverlapContribution(p, cursor, nextCursor, spanMs);
    if (nextCursor.getTime() <= hourStartMs) {
      break;
    }
    cursor = nextCursor;
  }
}

function aggregateSingleBucketAtClockIn(
  tc: TimecardForTimeSeries,
  keySet: Set<string>,
  timezone: string,
  granularity: SalesTrendGranularity,
  laborCostByKey: Record<string, number>,
  hoursByKey: Record<string, number>,
  businessStartTime?: string | undefined,
): void {
  const clockIn = tc.clock_in ? new Date(tc.clock_in) : null;
  if (!clockIn || Number.isNaN(clockIn.getTime())) return;
  const bucketOpts =
    businessStartTime != null && String(businessStartTime).trim() !== ""
      ? { businessStartTime: String(businessStartTime).trim() }
      : undefined;
  const key = getBucketKeyForDate(clockIn, timezone, granularity, bucketOpts);
  if (!key || !keySet.has(key)) return;

  const costs = tc.labor?.costs;
  if (typeof costs === "number" && Number.isFinite(costs)) {
    laborCostByKey[key] = (laborCostByKey[key] ?? 0) + costs;
  }

  const hours = getHoursFromLabor(tc.labor);
  hoursByKey[key] = (hoursByKey[key] ?? 0) + hours;
}

function aggregateTimecardsIntoHourlyBuckets(
  timecards: TimecardForTimeSeries[],
  keySet: Set<string>,
  tz: string,
  laborCostByKey: Record<string, number>,
  hoursByKey: Record<string, number>,
): void {
  for (const tc of timecards) {
    const clockIn = tc.clock_in ? new Date(tc.clock_in) : null;
    if (!clockIn || Number.isNaN(clockIn.getTime())) continue;

    const clockInMs = clockIn.getTime();
    const hours = getHoursFromLabor(tc.labor);
    const costs = tc.labor?.costs;
    const hasFiniteCost = typeof costs === "number" && Number.isFinite(costs);
    const costAmount = hasFiniteCost ? costs : 0;

    const shiftEndMs = resolveShiftEndMs(tc, clockInMs, hours);
    if (shiftEndMs == null) {
      aggregateSingleBucketAtClockIn(
        tc,
        keySet,
        tz,
        "hourly",
        laborCostByKey,
        hoursByKey,
        undefined,
      );
      continue;
    }

    addProratedHoursAndCostToHourlyBuckets({
      keySet,
      tz,
      clockInMs,
      shiftEndMs,
      hours,
      costs: costAmount,
      hasFiniteCost,
      laborCostByKey,
      hoursByKey,
    });
  }
}

/**
 * Aggregate timecards into laborCostByKey and hoursByKey by bucket (key from clock_in + granularity).
 * Hourly granularity: hours and labor cost are prorated across calendar hours overlapping the shift.
 * Mutates laborCostByKey and hoursByKey; keys must already exist on both maps.
 */
export function aggregateTimecardsIntoBuckets(
  timecards: TimecardForTimeSeries[],
  keys: string[],
  timezone: string,
  granularity: SalesTrendGranularity,
  laborCostByKey: Record<string, number>,
  hoursByKey: Record<string, number>,
  businessStartTime?: string | undefined,
): void {
  const keySet = new Set(keys);
  const tz = timezone.trim();

  if (granularity === "hourly") {
    aggregateTimecardsIntoHourlyBuckets(
      timecards,
      keySet,
      tz,
      laborCostByKey,
      hoursByKey,
    );
    return;
  }

  for (const tc of timecards) {
    aggregateSingleBucketAtClockIn(
      tc,
      keySet,
      tz,
      granularity,
      laborCostByKey,
      hoursByKey,
      businessStartTime,
    );
  }
}

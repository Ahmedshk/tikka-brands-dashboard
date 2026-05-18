/**
 * Up-front bulk prefetch for the all-locations dashboard fan-out.
 *
 * Per-query latency to Atlas dominates the read path (~240ms on M10 from a
 * dev box, ~5ms in-region in prod). A "naive" per-location worker that issues
 * `rollup-exists`, `find orders`, and `find timecards` for each of N locations
 * generates ~N×K serialized round-trips per page load, which compounds to
 * seconds even when every individual query is server-side-cheap.
 *
 * This helper collapses that into **three** Mongo round-trips total — one per
 * collection — by using `$in` over `locationId`. Results are bucketed per
 * location and seeded into the process-level caches that the existing
 * per-location loaders already consult:
 *
 *   - {@link primeOrderRangeCache} ← `bulkPrefetchSquareOrdersForLocations`
 *   - {@link primeTimecardRangeCache} ← `bulkPrefetchHomebaseTimecardsForLocations`
 *   - rollupExistsByDateCache ← `bulkPrefetchHourlyRollupExistsByDate`
 *
 * After this runs, each per-location worker's calls to
 * `loadSquareOrdersForMongoRange`, `loadHomebaseTimecardsForMongoRange`, and
 * `tryGetOrderTimeSeriesFromHourlyRollupsForKeys` become in-process cache
 * hits — zero Mongo round-trips on the hot path.
 *
 * Scope: only hourly granularity for the rollup-existence prefetch (the
 * dashboard's hot path). Daily/weekly/monthly probes still issue their own
 * Mongo queries; they're called less often and aren't the bottleneck today.
 */
import type { TimeRange } from "./businessHours.util.js";
import {
  bulkPrefetchSquareOrdersForLocations,
  bulkPrefetchHomebaseTimecardsForLocations,
} from "../services/integrationCacheRead.service.js";
import { bulkPrefetchHourlyRollupExistsByDate } from "../services/integrationRollupRead.service.js";
import { businessDateKeysIntersectingUtcRange } from "./businessDayUtcRange.util.js";
import {
  getSalesTrendPeriodRange,
  getSalesTrendComparisonRange,
  type GetSalesTrendComparisonRangeOptions,
  type PeriodType,
} from "./salesTrendDateRange.util.js";

/** Shared subset of the 3 sales-labor query types that affects date ranges. */
export interface AllLocationsPrefetchQueryDateFields {
  periodType: string;
  periodStart: string | undefined;
  periodEnd: string | undefined;
  comparisonType: string;
  comparisonDate: string | undefined;
  comparisonStart: string | undefined;
  comparisonEnd: string | undefined;
}

/**
 * Build the {@link AllLocationsPrefetchInput} for a single location from a
 * (query, timezone, businessStartTime) triple. Matches what
 * `getPeriodAndComparison` + `fetchSalesByCategoryForLocation` derive
 * internally so the cached ranges are identical to what the per-location
 * workers will request.
 */
export function buildPrefetchInputForLocation(params: {
  locationMongoId: string;
  timezone: string;
  businessStartTime: string;
  query: AllLocationsPrefetchQueryDateFields;
}): AllLocationsPrefetchInput {
  const { locationMongoId, timezone, businessStartTime, query } = params;
  const period = getSalesTrendPeriodRange(
    query.periodType as Parameters<typeof getSalesTrendPeriodRange>[0],
    timezone,
    query.periodStart,
    query.periodEnd,
    businessStartTime,
  );
  const comparisonOptions: GetSalesTrendComparisonRangeOptions = { businessStartTime };
  if (query.comparisonDate !== undefined) comparisonOptions.customComparisonDate = query.comparisonDate;
  if (query.comparisonStart !== undefined) comparisonOptions.customComparisonStart = query.comparisonStart;
  if (query.comparisonEnd !== undefined) comparisonOptions.customComparisonEnd = query.comparisonEnd;
  comparisonOptions.periodType = query.periodType as PeriodType;
  const comparison = getSalesTrendComparisonRange(
    query.comparisonType as Parameters<typeof getSalesTrendComparisonRange>[0],
    period.startAt,
    period.endAt,
    timezone,
    comparisonOptions,
  );
  return {
    locationMongoId,
    dataRange: { startAt: period.startAt, endAt: period.endAt },
    comparisonRange: comparison
      ? { startAt: comparison.startAt, endAt: comparison.endAt }
      : null,
    timezone,
    businessStartTime,
  };
}

export interface AllLocationsPrefetchInput {
  locationMongoId: string;
  /** Current period range, in absolute ISO UTC strings. */
  dataRange: TimeRange;
  /** Comparison period range, in absolute ISO UTC strings (or null). */
  comparisonRange: TimeRange | null;
  /** IANA TZ for this location, used to derive business date keys. */
  timezone: string;
  /** `HH:mm` business start in local time, used to derive business date keys. */
  businessStartTime: string;
}

function unionRangeOf(
  inputs: ReadonlyArray<AllLocationsPrefetchInput>,
): TimeRange | null {
  let startAt: string | null = null;
  let endAt: string | null = null;
  for (const p of inputs) {
    for (const r of p.comparisonRange ? [p.dataRange, p.comparisonRange] : [p.dataRange]) {
      if (startAt == null || r.startAt < startAt) startAt = r.startAt;
      if (endAt == null || r.endAt > endAt) endAt = r.endAt;
    }
  }
  return startAt && endAt ? { startAt, endAt } : null;
}

/**
 * Prefetch all Mongo data the all-locations sales-labor handlers will need,
 * seeding the process-level caches. Safe to call even when per-location
 * inputs are partial — locations missing here will fall through to the
 * normal per-location loaders.
 */
export async function prefetchAllLocationsDashboardData(
  inputs: ReadonlyArray<AllLocationsPrefetchInput>,
): Promise<void> {
  if (inputs.length === 0) return;
  const unionRange = unionRangeOf(inputs);
  if (!unionRange) return;

  const locationMongoIds = inputs.map((p) => p.locationMongoId);

  // (location, range) prime targets for the orders + timecards caches.
  const primeRanges: Array<{ locationMongoId: string; range: TimeRange }> = [];
  for (const p of inputs) {
    primeRanges.push({ locationMongoId: p.locationMongoId, range: p.dataRange });
    if (p.comparisonRange) {
      primeRanges.push({
        locationMongoId: p.locationMongoId,
        range: p.comparisonRange,
      });
    }
  }

  // Business date keys (per location, in its TZ) the hourly rollup probe will
  // ask about. We pass the union to the bulk aggregate; each (location, date)
  // pair gets a per-location verdict.
  const allDateKeys = new Set<string>();
  for (const p of inputs) {
    const ranges = p.comparisonRange ? [p.dataRange, p.comparisonRange] : [p.dataRange];
    for (const r of ranges) {
      for (const k of businessDateKeysIntersectingUtcRange(
        r.startAt,
        r.endAt,
        p.timezone,
        p.businessStartTime,
      )) {
        allDateKeys.add(k);
      }
    }
  }

  await Promise.all([
    bulkPrefetchSquareOrdersForLocations({
      locationMongoIds,
      unionRange,
      primeRanges,
    }),
    bulkPrefetchHomebaseTimecardsForLocations({
      locationMongoIds,
      unionRange,
      primeRanges,
    }),
    bulkPrefetchHourlyRollupExistsByDate({
      locationMongoIds,
      businessDateKeys: Array.from(allDateKeys),
    }),
  ]);
}

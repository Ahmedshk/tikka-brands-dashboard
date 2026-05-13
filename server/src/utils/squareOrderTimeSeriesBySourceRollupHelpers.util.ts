import { mapHourlyChartKeyToRollupSlot } from "./hourlyRollupRead.util.js";
import { sumSourcesOfSalesSegmentsToCentsById } from "./squareSourcesOfSalesMerge.util.js";

export function hourlySlotPairKey(
  businessDateKey: string,
  slotIndex: number,
): string {
  return `${businessDateKey}\t${slotIndex}`;
}

/** Ensure every bucket key exists per source (missing → 0). */
export function fillZeroForMissingBucketKeys(
  bySourceAndKey: Record<string, Record<string, number>>,
  bucketKeys: string[],
): void {
  for (const src of Object.keys(bySourceAndKey)) {
    const row = bySourceAndKey[src];
    if (!row) continue;
    for (const bk of bucketKeys) {
      row[bk] ??= 0;
    }
  }
}

export function buildHourlyChartCoordsOrNull(
  chartKeys: string[],
  timezone: string,
  businessStartTime: string,
): Array<{
  chartKey: string;
  businessDateKey: string;
  slotIndex: number;
}> | null {
  const tz = timezone.trim() || "UTC";
  const bst = (businessStartTime ?? "00:00").trim() || "00:00";
  const coords: Array<{
    chartKey: string;
    businessDateKey: string;
    slotIndex: number;
  }> = [];
  for (const chartKey of chartKeys) {
    const mapped = mapHourlyChartKeyToRollupSlot(chartKey, tz, bst);
    if (!mapped) return null;
    coords.push({ chartKey, ...mapped });
  }
  return coords;
}

export function uniqueHourlySlotPairsFromCoords(
  coords: Array<{ businessDateKey: string; slotIndex: number }>,
): Map<string, { businessDateKey: string; slotIndex: number }> {
  const uniquePairs = new Map<
    string,
    { businessDateKey: string; slotIndex: number }
  >();
  for (const c of coords) {
    uniquePairs.set(hourlySlotPairKey(c.businessDateKey, c.slotIndex), {
      businessDateKey: c.businessDateKey,
      slotIndex: c.slotIndex,
    });
  }
  return uniquePairs;
}

export function hourlyRollupDocsToSourcesByPairMap(
  docs: Array<{
    businessDateKey: string;
    slotIndex: number;
    sourcesOfSales?: unknown[];
  }>,
): Map<string, { sourcesOfSales: unknown[] }> {
  const byPair = new Map<string, { sourcesOfSales: unknown[] }>();
  for (const d of docs) {
    byPair.set(hourlySlotPairKey(d.businessDateKey, d.slotIndex), {
      sourcesOfSales: d.sourcesOfSales ?? [],
    });
  }
  return byPair;
}

export function mergeHourlySourcesIntoBySourceAndChartKey(
  coords: Array<{
    chartKey: string;
    businessDateKey: string;
    slotIndex: number;
  }>,
  byPair: Map<string, { sourcesOfSales: unknown[] }>,
  allChartKeys: string[],
): Record<string, Record<string, number>> | null {
  const bySourceAndKey: Record<string, Record<string, number>> = {};
  for (const c of coords) {
    const row = byPair.get(hourlySlotPairKey(c.businessDateKey, c.slotIndex));
    if (!row) return null;
    const centsMap = sumSourcesOfSalesSegmentsToCentsById(row.sourcesOfSales);
    for (const [src, cents] of centsMap) {
      bySourceAndKey[src] ??= {};
      bySourceAndKey[src][c.chartKey] =
        (bySourceAndKey[src][c.chartKey] ?? 0) + cents / 100;
    }
  }
  fillZeroForMissingBucketKeys(bySourceAndKey, allChartKeys);
  return Object.keys(bySourceAndKey).length === 0 ? null : bySourceAndKey;
}

/**
 * Sum `sourcesOfSales` per source id per bucket key (dollars). Missing buckets get 0 after fill.
 */
export function aggregateSourcesOfSalesBySourceAndBucketKeys(
  bucketKeys: string[],
  sourcesForBucket: (bucketKey: string) => unknown[] | undefined | null,
): Record<string, Record<string, number>> {
  const bySourceAndKey: Record<string, Record<string, number>> = {};
  for (const bk of bucketKeys) {
    const sources = sourcesForBucket(bk);
    if (sources == null) continue;
    const centsMap = sumSourcesOfSalesSegmentsToCentsById(sources);
    for (const [src, cents] of centsMap) {
      bySourceAndKey[src] ??= {};
      bySourceAndKey[src][bk] = cents / 100;
    }
  }
  fillZeroForMissingBucketKeys(bySourceAndKey, bucketKeys);
  return bySourceAndKey;
}

import {
  getBucketKeyForDate,
  type SalesTrendGranularity,
} from "./homebaseOrderedBuckets.util.js";

/** Matches {@link SquareServiceOptions} bucket-label fields used by sales trend charts. */
export function salesTrendBucketLabelOptsFromSquareOptions(options?: {
  periodType?: string;
  businessStartTime?: string;
}): { periodType?: string; businessStartTime?: string } | undefined {
  const periodType = options?.periodType;
  const businessStartTime = options?.businessStartTime;
  if (periodType == null && businessStartTime == null) {
    return undefined;
  }
  const out: { periodType?: string; businessStartTime?: string } = {};
  if (periodType != null) {
    out.periodType = periodType;
  }
  if (businessStartTime != null) {
    out.businessStartTime = businessStartTime;
  }
  return out;
}

/** Net sales ($) and transaction counts per bucket key (aligned with {@link getOrderedBucketsAndLabels} keys). */
export function aggregateOrdersIntoTimeSeriesBuckets<T extends { created_at?: string }>(
  orders: T[],
  keys: string[],
  timezone: string,
  granularity: SalesTrendGranularity,
  bucketOpts: { businessStartTime?: string } | undefined,
  isOrderCountedForNetSales: (order: T) => boolean,
  orderNetSalesCents: (order: T) => number,
): { netSalesByKey: Record<string, number>; countByKey: Record<string, number> } {
  const netSalesByKey: Record<string, number> = {};
  const countByKey: Record<string, number> = {};
  for (const k of keys) {
    netSalesByKey[k] = 0;
    countByKey[k] = 0;
  }
  for (const order of orders) {
    if (!isOrderCountedForNetSales(order)) continue;
    const netCents = orderNetSalesCents(order);
    const key = getBucketKeyForDate(
      new Date(order.created_at ?? ""),
      timezone,
      granularity,
      bucketOpts,
    );
    if (!key || netSalesByKey[key] === undefined) continue;
    netSalesByKey[key] = (netSalesByKey[key] ?? 0) + netCents / 100;
    if (netCents > 0) countByKey[key] = (countByKey[key] ?? 0) + 1;
  }
  return { netSalesByKey, countByKey };
}

/** Merge raw rollup source keys through {@link normalizeTrendSourceKey} (e.g. In-Store + Pickup → Register). */
export function mergeNormalizedTrendSourceRollupMaps(
  fromRollup: Record<string, Record<string, number>>,
  normalizeTrendSourceKey: (rawKey: string) => string,
): Record<string, Record<string, number>> {
  const merged: Record<string, Record<string, number>> = {};
  for (const [rawKey, record] of Object.entries(fromRollup)) {
    const normKey = normalizeTrendSourceKey(rawKey);
    let row = merged[normKey];
    if (!row) {
      row = {};
      merged[normKey] = row;
    }
    for (const [bucketKey, value] of Object.entries(record ?? {})) {
      row[bucketKey] = (row[bucketKey] ?? 0) + (value ?? 0);
    }
  }
  return merged;
}

export type AggregateOrdersIntoBySourceParams<T extends { created_at?: string }> = {
  chartBucketKeys: string[];
  timezone: string;
  granularity: SalesTrendGranularity;
  bucketOpts: { businessStartTime?: string } | undefined;
  isOrderCountedForNetSales: (order: T) => boolean;
  orderNetSalesCents: (order: T) => number;
  normalizedSourceKeyForOrder: (order: T) => string;
};

/** Net sales ($) per normalized source × chart bucket key (stacked by-source chart). */
export function aggregateOrdersIntoBySourceAndBucketKeys<
  T extends { created_at?: string },
>(
  orders: T[],
  params: AggregateOrdersIntoBySourceParams<T>,
): Record<string, Record<string, number>> {
  const {
    chartBucketKeys,
    timezone,
    granularity,
    bucketOpts,
    isOrderCountedForNetSales,
    orderNetSalesCents,
    normalizedSourceKeyForOrder,
  } = params;
  const bySourceAndKey: Record<string, Record<string, number>> = {};
  const keySet = new Set(chartBucketKeys);
  for (const order of orders) {
    if (!isOrderCountedForNetSales(order)) continue;
    const cents = orderNetSalesCents(order);
    if (cents <= 0) continue;
    const sourceKey = normalizedSourceKeyForOrder(order);
    const bucketKey = getBucketKeyForDate(
      new Date(order.created_at ?? ""),
      timezone,
      granularity,
      bucketOpts,
    );
    if (!bucketKey || !keySet.has(bucketKey)) continue;
    bySourceAndKey[sourceKey] ??= {};
    const keyRecord = bySourceAndKey[sourceKey];
    keyRecord[bucketKey] = (keyRecord[bucketKey] ?? 0) + cents / 100;
  }
  return bySourceAndKey;
}

export type StackedSeriesRow = {
  id: string;
  label: string;
  data: number[];
  color: string;
};

/** Build stacked-area series rows sorted by source id. */
export function buildStackedSeriesFromSourceMaps(
  mergedBySource: Record<string, Record<string, number>>,
  chartBucketKeys: string[],
  segmentKeyToLabel: (id: string) => string,
  generateDistinctColors: (
    count: number,
    opts: { nonAdjacent: boolean },
  ) => string[],
): StackedSeriesRow[] {
  const sourceKeys = Object.keys(mergedBySource).sort((a, b) =>
    a.localeCompare(b),
  );
  const colors = generateDistinctColors(sourceKeys.length, {
    nonAdjacent: true,
  });
  return sourceKeys.map((sourceKey, index) => ({
    id: sourceKey,
    label: segmentKeyToLabel(sourceKey),
    data: chartBucketKeys.map((k) => mergedBySource[sourceKey]?.[k] ?? 0),
    color: colors[index] ?? "#6D6D6D",
  }));
}

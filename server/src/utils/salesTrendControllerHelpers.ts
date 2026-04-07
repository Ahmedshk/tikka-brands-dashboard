/**
 * Helpers for getSalesTrend controller. Extracted to keep cognitive complexity low.
 */

import type { Request } from "express";
import {
  getOrderTimeSeriesInRange,
  getOrderTimeSeriesBySourceInRange,
  getOrderedBucketsAndLabels,
  type SquareServiceOptions,
  type SalesTrendGranularity,
  type OrderTimeSeriesBySourceSeries,
} from "../services/square.service.js";
import {
  loadSquareOrdersForMongoRange,
  createMongoCatalogBatchRetrieve,
  getLaborAndHoursTimeSeriesInRangeFromCache,
} from "../services/integrationCacheRead.service.js";
import type {
  Granularity,
  PeriodRangeResult,
  ComparisonRangeResult,
  GetSalesTrendComparisonRangeOptions,
  PeriodType,
} from "../utils/salesTrendDateRange.util.js";
import {
  getSalesTrendPeriodRange,
  getSalesTrendComparisonRange,
  getStartOfDayUtc,
  getCalendarDayCountInRange,
} from "../utils/salesTrendDateRange.util.js";
import type { TimeRange } from "../utils/businessHours.util.js";

export class LaborDateRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LaborDateRangeError";
  }
}

export interface SalesTrendQueryParams {
  locationId: string;
  periodType: string;
  periodStart: string | undefined;
  periodEnd: string | undefined;
  comparisonType: string;
  comparisonDate: string | undefined;
  comparisonStart: string | undefined;
  comparisonEnd: string | undefined;
  metric: string;
  groupBy: string;
}

export interface SalesTrendContext {
  /** Mongo ObjectId string for EXTERNAL_DATA_CACHE_READ Square order/catalog paths. */
  locationMongoId?: string;
  location: {
    squareLocationId?: string | null;
    homebaseLocationId?: string | null;
    timezone?: string | null;
    businessStartTime?: string | null;
  };
  squareAccessToken: string | null;
  homebaseApiKey: string | null;
  timezone: string;
  businessStartTime: string;
}

export interface SalesTrendBySourceData {
  xAxisLabels: string[];
  granularity: Granularity;
  series: OrderTimeSeriesBySourceSeries[];
}

export interface SalesTrendSeriesData {
  xAxisLabels: string[];
  granularity: Granularity;
  currentPeriod: (number | null)[];
  comparisonPeriod: (number | null)[];
  periodRange: TimeRange;
  comparisonRange: TimeRange | null;
}

export function toSeriesGranularity(g: Granularity): SalesTrendGranularity {
  if (g === "hourly" || g === "daily" || g === "weekly" || g === "monthly") return g;
  return "daily";
}

export function parseSalesTrendQuery(query: Request["query"]): SalesTrendQueryParams {
  return {
    locationId: typeof query.locationId === "string" ? query.locationId : "",
    periodType: (query.periodType as string) || "last30days",
    periodStart: typeof query.periodStart === "string" ? query.periodStart : undefined,
    periodEnd: typeof query.periodEnd === "string" ? query.periodEnd : undefined,
    comparisonType: (query.comparisonType as string) || "priorYear",
    comparisonDate: typeof query.comparisonDate === "string" ? query.comparisonDate : undefined,
    comparisonStart: typeof query.comparisonStart === "string" ? query.comparisonStart : undefined,
    comparisonEnd: typeof query.comparisonEnd === "string" ? query.comparisonEnd : undefined,
    metric: (query.metric as string) || "netSales",
    groupBy: (query.groupBy as string) || "none",
  };
}

export function buildSalesTrendContext(
  location: SalesTrendContext["location"],
  squareAccessToken: string | null,
  homebaseApiKey: string | null,
  locationMongoId?: string | null,
): SalesTrendContext {
  const id = locationMongoId?.trim();
  return {
    ...(id ? { locationMongoId: id } : {}),
    location,
    squareAccessToken,
    homebaseApiKey,
    timezone: location.timezone?.trim() ?? "UTC",
    businessStartTime: location.businessStartTime?.trim() ?? "00:00",
  };
}

async function buildSquareOrderCacheOptions(
  locationMongoId: string | undefined,
  range: TimeRange,
  base?: SquareServiceOptions,
): Promise<SquareServiceOptions | undefined> {
  if (!locationMongoId?.trim()) {
    return base;
  }
  const id = locationMongoId.trim();
  const orders = await loadSquareOrdersForMongoRange(id, range);
  return {
    ...base,
    ordersOverride: orders,
    batchRetrieveCatalogOverride: createMongoCatalogBatchRetrieve(id),
  };
}

export function getPeriodAndComparison(
  params: SalesTrendQueryParams,
  timezone: string,
  businessStartTime: string,
): {
  period: PeriodRangeResult;
  comparison: ComparisonRangeResult | null;
  seriesGranularity: SalesTrendGranularity;
  dataRange: TimeRange;
  displayRange: TimeRange;
  useDisplayRange: boolean;
  periodType: string;
} {
  const period = getSalesTrendPeriodRange(
    params.periodType as Parameters<typeof getSalesTrendPeriodRange>[0],
    timezone,
    params.periodStart,
    params.periodEnd,
    businessStartTime,
  );
  const displayEnd = period.displayEndAt ?? period.endAt;
  const comparisonOptions: GetSalesTrendComparisonRangeOptions = {
    businessStartTime,
  };
  if (params.comparisonDate !== undefined) comparisonOptions.customComparisonDate = params.comparisonDate;
  if (params.comparisonStart !== undefined) comparisonOptions.customComparisonStart = params.comparisonStart;
  if (params.comparisonEnd !== undefined) comparisonOptions.customComparisonEnd = params.comparisonEnd;
  if (params.periodType !== undefined) comparisonOptions.periodType = params.periodType as PeriodType;
  const comparison = getSalesTrendComparisonRange(
    params.comparisonType as Parameters<typeof getSalesTrendComparisonRange>[0],
    period.startAt,
    period.endAt,
    timezone,
    comparisonOptions,
  );
  const seriesGranularity = toSeriesGranularity(period.granularity);
  const dataRange = { startAt: period.startAt, endAt: period.endAt };
  const displayRange = { startAt: period.startAt, endAt: displayEnd };
  const useDisplayRange = period.displayEndAt != null;
  return { period, comparison, seriesGranularity, dataRange, displayRange, useDisplayRange, periodType: params.periodType };
}

export interface FetchBySourceOptions {
  dataRange: TimeRange;
  displayRange: TimeRange;
  timezone: string;
  seriesGranularity: SalesTrendGranularity;
  useDisplayRange: boolean;
  periodType: string;
  accessToken: string | undefined;
  locationMongoId?: string;
}

export async function fetchSalesTrendBySource(
  squareLocationId: string,
  opts: FetchBySourceOptions,
): Promise<SalesTrendBySourceData | null> {
  const squareOpts = await buildSquareOrderCacheOptions(
    opts.locationMongoId,
    opts.dataRange,
    { accessToken: opts.accessToken, periodType: opts.periodType },
  );
  const result = await getOrderTimeSeriesBySourceInRange(
    squareLocationId,
    opts.dataRange,
    opts.timezone,
    opts.seriesGranularity,
    squareOpts ?? { accessToken: opts.accessToken, periodType: opts.periodType },
  );
  let xAxisLabelsSource = result.labels;
  let seriesSource = result.series;
  if (opts.useDisplayRange) {
    const displayBuckets = getOrderedBucketsAndLabels(
      opts.displayRange,
      opts.timezone,
      opts.seriesGranularity,
      { periodType: opts.periodType },
    );
    const dataBuckets = getOrderedBucketsAndLabels(
      opts.dataRange,
      opts.timezone,
      opts.seriesGranularity,
      { periodType: opts.periodType },
    );
    xAxisLabelsSource = displayBuckets.labels;
    const dataLen = dataBuckets.keys.length;
    seriesSource = result.series.map((s) => ({
      ...s,
      data: displayBuckets.keys.map((_, i) => (i < dataLen ? (s.data[i] ?? 0) : 0)),
    }));
  }
  return { xAxisLabels: xAxisLabelsSource, granularity: opts.seriesGranularity as Granularity, series: seriesSource };
}

function mapOrderMetricsToDisplay(
  metric: string,
  displayBuckets: { keys: string[] },
  netSalesByKey: Record<string, number>,
  txnByKey: Record<string, number>,
): (number | null)[] {
  if (metric === "netSales") {
    return displayBuckets.keys.map((k) => (k in netSalesByKey ? netSalesByKey[k]! : null));
  }
  if (metric === "transactions") {
    return displayBuckets.keys.map((k) => (k in txnByKey ? txnByKey[k]! : null));
  }
  return displayBuckets.keys.map((k) => {
    const sales = netSalesByKey[k];
    const txn = txnByKey[k];
    if (sales === undefined || txn === undefined) return null;
    return txn > 0 ? sales / txn : 0;
  });
}

function mapComparisonOrderMetrics(
  metric: string,
  displayBuckets: { keys: string[] },
  compNetSales: number[],
  compTxn: number[],
): (number | null)[] {
  if (metric === "netSales") {
    return displayBuckets.keys.map((_, i) => (i < compNetSales.length ? compNetSales[i]! : 0));
  }
  if (metric === "transactions") {
    return displayBuckets.keys.map((_, i) => (i < compTxn.length ? compTxn[i]! : 0));
  }
  return displayBuckets.keys.map((_, i) =>
    i < compNetSales.length && (compTxn[i] ?? 0) > 0 ? compNetSales[i]! / compTxn[i]! : 0,
  );
}

function buildOrderMetricsNoDisplayRange(
  current: { labels: string[]; netSales: number[]; transactionCount: number[] },
  comp: { netSales: number[]; transactionCount: number[] } | null,
  metric: string,
): { xAxisLabels: string[]; currentPeriod: (number | null)[]; comparisonPeriod: (number | null)[] } {
  const xAxisLabels = current.labels;
  if (metric === "netSales") {
    return {
      xAxisLabels,
      currentPeriod: current.netSales,
      comparisonPeriod: comp ? comp.netSales : current.netSales.map(() => 0),
    };
  }
  if (metric === "transactions") {
    return {
      xAxisLabels,
      currentPeriod: current.transactionCount,
      comparisonPeriod: comp ? comp.transactionCount : current.transactionCount.map(() => 0),
    };
  }
  const currentPeriod = current.netSales.map((_, i) =>
    (current.transactionCount[i] ?? 0) > 0 ? current.netSales[i]! / current.transactionCount[i]! : 0,
  );
  const comparisonPeriod = comp
    ? comp.netSales.map((_, i) =>
        (comp.transactionCount[i] ?? 0) > 0 ? comp.netSales[i]! / comp.transactionCount[i]! : 0,
      )
    : currentPeriod.map(() => 0);
  return { xAxisLabels, currentPeriod, comparisonPeriod };
}

export interface FetchOrderMetricsOptions {
  dataRange: TimeRange;
  displayRange: TimeRange;
  timezone: string;
  seriesGranularity: SalesTrendGranularity;
  useDisplayRange: boolean;
  periodType: string;
  metric: string;
  comparisonRange: TimeRange | null;
  accessToken: string | undefined;
  locationMongoId?: string;
}

export async function fetchSalesTrendOrderMetrics(
  squareLocationId: string,
  opts: FetchOrderMetricsOptions,
): Promise<{ xAxisLabels: string[]; currentPeriod: (number | null)[]; comparisonPeriod: (number | null)[] }> {
  const baseOpts: SquareServiceOptions = {
    accessToken: opts.accessToken,
    periodType: opts.periodType,
  };
  const [currentOpts, compOpts] = await Promise.all([
    buildSquareOrderCacheOptions(opts.locationMongoId, opts.dataRange, baseOpts),
    opts.comparisonRange
      ? buildSquareOrderCacheOptions(opts.locationMongoId, opts.comparisonRange, baseOpts)
      : Promise.resolve(undefined),
  ]);
  const [current, comp] = await Promise.all([
    getOrderTimeSeriesInRange(
      squareLocationId,
      opts.dataRange,
      opts.timezone,
      opts.seriesGranularity,
      currentOpts ?? baseOpts,
    ),
    opts.comparisonRange
      ? getOrderTimeSeriesInRange(
          squareLocationId,
          opts.comparisonRange,
          opts.timezone,
          opts.seriesGranularity,
          compOpts ?? baseOpts,
        )
      : null,
  ]);
  if (opts.useDisplayRange) {
    const displayBuckets = getOrderedBucketsAndLabels(
      opts.displayRange,
      opts.timezone,
      opts.seriesGranularity,
      { periodType: opts.periodType },
    );
    const dataBuckets = getOrderedBucketsAndLabels(
      opts.dataRange,
      opts.timezone,
      opts.seriesGranularity,
      { periodType: opts.periodType },
    );
    const netSalesByKey: Record<string, number> = {};
    const txnByKey: Record<string, number> = {};
    dataBuckets.keys.forEach((k, j) => {
      netSalesByKey[k] = current.netSales[j] ?? 0;
      txnByKey[k] = current.transactionCount[j] ?? 0;
    });
    return {
      xAxisLabels: displayBuckets.labels,
      currentPeriod: mapOrderMetricsToDisplay(opts.metric, displayBuckets, netSalesByKey, txnByKey),
      comparisonPeriod: mapComparisonOrderMetrics(
        opts.metric,
        displayBuckets,
        comp?.netSales ?? [],
        comp?.transactionCount ?? [],
      ),
    };
  }
  return buildOrderMetricsNoDisplayRange(current, comp, opts.metric);
}

export interface FetchLaborMetricsOptions {
  dataRange: TimeRange;
  displayRange: TimeRange;
  timezone: string;
  seriesGranularity: SalesTrendGranularity;
  useDisplayRange: boolean;
  periodType: string;
  metric: string;
  comparisonRange: TimeRange | null;
  apiKey: string | undefined;
  /** Mongo location id: labor series use synced Homebase timecards only. */
  locationMongoId?: string;
}

async function laborSeriesForRange(
  _homebaseLocationId: string,
  range: TimeRange,
  timezone: string,
  granularity: SalesTrendGranularity,
  periodType: string,
  _apiKey: string | undefined,
  locationMongoId: string | undefined,
): Promise<
  Awaited<ReturnType<typeof getLaborAndHoursTimeSeriesInRangeFromCache>>
> {
  if (!locationMongoId?.trim()) {
    const { keys, labels } = getOrderedBucketsAndLabels(
      range,
      timezone,
      granularity,
      periodType ? { periodType } : undefined,
    );
    return {
      labels,
      laborCost: keys.map(() => 0),
      hours: keys.map(() => 0),
    };
  }
  return getLaborAndHoursTimeSeriesInRangeFromCache(
    locationMongoId.trim(),
    range,
    timezone,
    granularity,
    periodType,
  );
}

export async function fetchSalesTrendLaborMetrics(
  homebaseLocationId: string,
  opts: FetchLaborMetricsOptions,
): Promise<{ xAxisLabels: string[]; currentPeriod: (number | null)[]; comparisonPeriod: (number | null)[] }> {
  const [current, comp] = await Promise.all([
    laborSeriesForRange(
      homebaseLocationId,
      opts.dataRange,
      opts.timezone,
      opts.seriesGranularity,
      opts.periodType,
      opts.apiKey,
      opts.locationMongoId,
    ),
    opts.comparisonRange
      ? laborSeriesForRange(
          homebaseLocationId,
          opts.comparisonRange,
          opts.timezone,
          opts.seriesGranularity,
          opts.periodType,
          opts.apiKey,
          opts.locationMongoId,
        )
      : null,
  ]);
  if (opts.useDisplayRange) {
    const displayBuckets = getOrderedBucketsAndLabels(
      opts.displayRange,
      opts.timezone,
      opts.seriesGranularity,
      { periodType: opts.periodType },
    );
    const dataBuckets = getOrderedBucketsAndLabels(
      opts.dataRange,
      opts.timezone,
      opts.seriesGranularity,
      { periodType: opts.periodType },
    );
    const laborCostByKey: Record<string, number> = {};
    const hoursByKey: Record<string, number> = {};
    dataBuckets.keys.forEach((k, j) => {
      laborCostByKey[k] = current.laborCost[j] ?? 0;
      hoursByKey[k] = current.hours[j] ?? 0;
    });
    if (opts.metric === "laborCost") {
      return {
        xAxisLabels: displayBuckets.labels,
        currentPeriod: displayBuckets.keys.map((k) => (k in laborCostByKey ? laborCostByKey[k]! : null)),
        comparisonPeriod: displayBuckets.keys.map((_, i) =>
          i < (comp?.laborCost.length ?? 0) ? comp!.laborCost[i]! : 0,
        ),
      };
    }
    return {
      xAxisLabels: displayBuckets.labels,
      currentPeriod: displayBuckets.keys.map((k) => (k in hoursByKey ? hoursByKey[k]! : null)),
      comparisonPeriod: displayBuckets.keys.map((_, i) => (i < (comp?.hours.length ?? 0) ? comp!.hours[i]! : 0)),
    };
  }
  if (opts.metric === "laborCost") {
    return {
      xAxisLabels: current.labels,
      currentPeriod: current.laborCost,
      comparisonPeriod: comp ? comp.laborCost : current.laborCost.map(() => 0),
    };
  }
  return {
    xAxisLabels: current.labels,
    currentPeriod: current.hours,
    comparisonPeriod: comp ? comp.hours : current.hours.map(() => 0),
  };
}

export interface AlignComparisonOptions {
  currentRange: TimeRange;
  comparisonRange: TimeRange | null;
  timezone: string;
  seriesGranularity: SalesTrendGranularity;
  periodType: string;
  xAxisLabels: string[];
  currentPeriod: (number | null)[];
  comparisonPeriod: (number | null)[];
}

export function alignComparisonAndMaskFuture(
  opts: AlignComparisonOptions,
): { xAxisLabels: string[]; currentPeriod: (number | null)[]; comparisonPeriod: (number | null)[] } {
  let labels = opts.xAxisLabels;
  let current = opts.currentPeriod;
  let comp = opts.comparisonPeriod;
  if (opts.comparisonRange && comp.length > 0) {
    const currentBuckets = getOrderedBucketsAndLabels(
      opts.currentRange,
      opts.timezone,
      opts.seriesGranularity,
      { periodType: opts.periodType },
    );
    const compBuckets = getOrderedBucketsAndLabels(
      opts.comparisonRange,
      opts.timezone,
      opts.seriesGranularity,
      { periodType: opts.periodType },
    );
    const currentByKey = new Map<string, number | null>();
    currentBuckets.keys.forEach((k, i) => currentByKey.set(k, current[i] ?? null));
    const compByKey = new Map<string, number | null>();
    compBuckets.keys.forEach((k, i) => compByKey.set(k, comp[i] ?? null));
    const currentKeySet = new Set(currentBuckets.keys);
    const compKeySet = new Set(compBuckets.keys);
    const hasExtraCompKeys = compBuckets.keys.some((k) => !currentKeySet.has(k));
    const hasOverlap = currentBuckets.keys.some((k) => compKeySet.has(k));
    let finalKeys: string[];
    if (hasExtraCompKeys && hasOverlap) {
      const now = new Date();
      const mergedStart = new Date(
        Math.min(
          new Date(opts.currentRange.startAt).getTime(),
          new Date(opts.comparisonRange.startAt).getTime(),
        ),
      ).toISOString();
      const mergedEnd = new Date(
        Math.min(
          Math.max(
            new Date(opts.currentRange.endAt).getTime(),
            new Date(opts.comparisonRange.endAt).getTime(),
          ),
          now.getTime(),
        ),
      ).toISOString();
      const mergedBuckets = getOrderedBucketsAndLabels(
        { startAt: mergedStart, endAt: mergedEnd },
        opts.timezone,
        opts.seriesGranularity,
        { periodType: opts.periodType },
      );
      finalKeys = mergedBuckets.keys;
      labels = mergedBuckets.labels;
      current = mergedBuckets.keys.map((k) => (currentByKey.has(k) ? currentByKey.get(k)! : null));
      comp = mergedBuckets.keys.map((k) => (compByKey.has(k) ? compByKey.get(k)! : null));
    } else {
      finalKeys = hasExtraCompKeys ? currentBuckets.keys : compBuckets.keys;
      if (hasExtraCompKeys && !hasOverlap && comp.length !== current.length) {
        comp = current.map((_, i) => (i < comp.length ? comp[i]! : null));
      }
    }
    comp = maskFutureBuckets(comp, finalKeys, opts.timezone, opts.seriesGranularity);
  } else if (comp.length > 0 && comp.length !== current.length) {
    comp = current.map(() => 0);
  }
  return { xAxisLabels: labels, currentPeriod: current, comparisonPeriod: comp };
}

function maskFutureBuckets(
  comparisonPeriod: (number | null)[],
  finalKeys: string[],
  timezone: string,
  seriesGranularity: SalesTrendGranularity,
): (number | null)[] {
  const now = new Date();
  return comparisonPeriod.map((val, i) => {
    const key = finalKeys[i];
    if (!key) return val;
    const parts = key.split("-").map((p) => Number.parseInt(p, 10));
    const bucketDate = parseBucketKeyToDate(parts, timezone, seriesGranularity);
    return bucketDate > now ? null : val;
  });
}

function parseBucketKeyToDate(
  parts: number[],
  timezone: string,
  seriesGranularity: SalesTrendGranularity,
): Date {
  if (seriesGranularity === "hourly" && parts.length >= 4) {
    const bucketDate = getStartOfDayUtc(parts[0]!, parts[1]! - 1, parts[2]!, timezone);
    return new Date(bucketDate.getTime() + parts[3]! * 60 * 60 * 1000);
  }
  if (seriesGranularity === "monthly" && parts.length >= 2) {
    return getStartOfDayUtc(parts[0]!, parts[1]! - 1, 1, timezone);
  }
  return getStartOfDayUtc(parts[0]!, parts[1]! - 1, parts[2]!, timezone);
}

export type SalesTrendResult =
  | { kind: "bySource"; data: SalesTrendBySourceData }
  | { kind: "series"; data: SalesTrendSeriesData };

interface SeriesMetricsPayload {
  xAxisLabels: string[];
  currentPeriod: (number | null)[];
  comparisonPeriod: (number | null)[];
}

async function fetchSeriesMetricsPayload(
  metric: string,
  squareLocationId: string | undefined,
  homebaseLocationId: string | undefined,
  ctx: SalesTrendContext,
  opts: {
    dataRange: TimeRange;
    displayRange: TimeRange;
    timezone: string;
    seriesGranularity: SalesTrendGranularity;
    useDisplayRange: boolean;
    periodType: string;
    comparisonRange: TimeRange | null;
  },
): Promise<SeriesMetricsPayload> {
  const empty: SeriesMetricsPayload = { xAxisLabels: [], currentPeriod: [], comparisonPeriod: [] };
  const orderMetrics = ["netSales", "transactions", "averageCheck"];
  if (orderMetrics.includes(metric) && squareLocationId) {
    return fetchSalesTrendOrderMetrics(squareLocationId, {
      ...opts,
      metric,
      accessToken: ctx.squareAccessToken ?? undefined,
      ...(ctx.locationMongoId != null ? { locationMongoId: ctx.locationMongoId } : {}),
    });
  }
  if (!homebaseLocationId) return empty;
  try {
    return await fetchSalesTrendLaborMetrics(homebaseLocationId, {
      ...opts,
      metric,
      apiKey: ctx.homebaseApiKey ?? undefined,
      ...(ctx.locationMongoId != null ? { locationMongoId: ctx.locationMongoId } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("invalid_date_range") || msg.includes("cannot exceed a month")) {
      throw new LaborDateRangeError("Your date range cannot exceed a month. Try a smaller range.");
    }
    throw err;
  }
}

export async function getSalesTrendData(
  ctx: SalesTrendContext,
  params: SalesTrendQueryParams,
): Promise<SalesTrendResult> {
  const { period, comparison, seriesGranularity, dataRange, displayRange, useDisplayRange, periodType } =
    getPeriodAndComparison(params, ctx.timezone, ctx.businessStartTime);
  const comparisonRange = comparison ? { startAt: comparison.startAt, endAt: comparison.endAt } : null;
  const squareLocationId = ctx.location.squareLocationId?.trim();
  const homebaseLocationId = ctx.location.homebaseLocationId?.trim();

  if (params.metric === "netSales" && params.groupBy === "source") {
    if (!squareLocationId) {
      return { kind: "bySource", data: { xAxisLabels: [], granularity: period.granularity, series: [] } };
    }
    const bySource = await fetchSalesTrendBySource(squareLocationId, {
      dataRange,
      displayRange,
      timezone: ctx.timezone,
      seriesGranularity,
      useDisplayRange,
      periodType,
      accessToken: ctx.squareAccessToken ?? undefined,
      ...(ctx.locationMongoId != null ? { locationMongoId: ctx.locationMongoId } : {}),
    });
    return { kind: "bySource", data: bySource! };
  }

  const seriesPayload = await fetchSeriesMetricsPayload(
    params.metric,
    squareLocationId,
    homebaseLocationId,
    ctx,
    {
      dataRange,
      displayRange,
      timezone: ctx.timezone,
      seriesGranularity,
      useDisplayRange,
      periodType,
      comparisonRange,
    },
  );

  const currentRange = useDisplayRange ? displayRange : dataRange;
  const aligned = alignComparisonAndMaskFuture({
    currentRange,
    comparisonRange,
    timezone: ctx.timezone,
    seriesGranularity,
    periodType,
    xAxisLabels: seriesPayload.xAxisLabels,
    currentPeriod: seriesPayload.currentPeriod,
    comparisonPeriod: seriesPayload.comparisonPeriod,
  });
  return {
    kind: "series",
    data: {
      xAxisLabels: aligned.xAxisLabels,
      granularity: period.granularity,
      currentPeriod: aligned.currentPeriod,
      comparisonPeriod: aligned.comparisonPeriod,
      periodRange: { startAt: period.startAt, endAt: period.endAt },
      comparisonRange,
    },
  };
}

export function isLaborDateRangeError(err: unknown): err is LaborDateRangeError {
  return err instanceof LaborDateRangeError;
}

// --- Sales Trend KPI (getSalesTrendKpi) ---

export interface SalesTrendKpiQueryParams {
  locationId: string;
  periodType: string;
  periodStart: string | undefined;
  periodEnd: string | undefined;
  comparisonType: string;
  comparisonDate: string | undefined;
  comparisonStart: string | undefined;
  comparisonEnd: string | undefined;
}

export interface SalesTrendKpiData {
  periodRange: TimeRange;
  comparisonRange: TimeRange | null;
  current: {
    totalNetSales: number;
    totalTransactions: number;
    totalHours: number;
    numDays: number;
  };
  comparison: {
    totalNetSales: number;
    totalTransactions: number;
    totalHours: number;
    numDays: number;
  };
}

export function parseSalesTrendKpiQuery(query: Request["query"]): SalesTrendKpiQueryParams {
  return {
    locationId: typeof query.locationId === "string" ? query.locationId : "",
    periodType: (query.periodType as string) || "last30days",
    periodStart: typeof query.periodStart === "string" ? query.periodStart : undefined,
    periodEnd: typeof query.periodEnd === "string" ? query.periodEnd : undefined,
    comparisonType: (query.comparisonType as string) || "priorYear",
    comparisonDate: typeof query.comparisonDate === "string" ? query.comparisonDate : undefined,
    comparisonStart: typeof query.comparisonStart === "string" ? query.comparisonStart : undefined,
    comparisonEnd: typeof query.comparisonEnd === "string" ? query.comparisonEnd : undefined,
  };
}

function sumNullable(arr: (number | null)[]): number {
  return arr.reduce((s: number, v) => s + (v ?? 0), 0);
}

interface KpiTotals {
  totalNetSalesCurrent: number;
  totalTransactionsCurrent: number;
  totalNetSalesComparison: number;
  totalTransactionsComparison: number;
}

async function fetchSquareKpiTotals(
  squareLocationId: string,
  dataRange: TimeRange,
  comparisonRange: TimeRange | null,
  ctx: SalesTrendContext,
  seriesGranularity: SalesTrendGranularity,
  periodType: string,
): Promise<KpiTotals> {
  const baseOpts: SquareServiceOptions = {
    accessToken: ctx.squareAccessToken ?? undefined,
    periodType,
  };
  const [currentOpts, compOpts] = await Promise.all([
    buildSquareOrderCacheOptions(ctx.locationMongoId, dataRange, baseOpts),
    comparisonRange
      ? buildSquareOrderCacheOptions(ctx.locationMongoId, comparisonRange, baseOpts)
      : Promise.resolve(undefined),
  ]);
  const [current, comp] = await Promise.all([
    getOrderTimeSeriesInRange(
      squareLocationId,
      dataRange,
      ctx.timezone,
      seriesGranularity,
      currentOpts ?? baseOpts,
    ),
    comparisonRange
      ? getOrderTimeSeriesInRange(
          squareLocationId,
          comparisonRange,
          ctx.timezone,
          seriesGranularity,
          compOpts ?? baseOpts,
        )
      : null,
  ]);
  return {
    totalNetSalesCurrent: sumNullable(current.netSales),
    totalTransactionsCurrent: sumNullable(current.transactionCount),
    totalNetSalesComparison: comp ? sumNullable(comp.netSales) : 0,
    totalTransactionsComparison: comp ? sumNullable(comp.transactionCount) : 0,
  };
}

interface LaborKpiTotals {
  totalHoursCurrent: number;
  totalHoursComparison: number;
}

async function fetchLaborKpiTotals(
  homebaseLocationId: string,
  dataRange: TimeRange,
  comparisonRange: TimeRange | null,
  ctx: SalesTrendContext,
  seriesGranularity: SalesTrendGranularity,
  periodType: string,
): Promise<LaborKpiTotals> {
  const [current, comp] = await Promise.all([
    laborSeriesForRange(
      homebaseLocationId,
      dataRange,
      ctx.timezone,
      seriesGranularity,
      periodType,
      ctx.homebaseApiKey ?? undefined,
      ctx.locationMongoId ?? undefined,
    ),
    comparisonRange
      ? laborSeriesForRange(
          homebaseLocationId,
          comparisonRange,
          ctx.timezone,
          seriesGranularity,
          periodType,
          ctx.homebaseApiKey ?? undefined,
          ctx.locationMongoId ?? undefined,
        )
      : null,
  ]);
  return {
    totalHoursCurrent: current.hours.reduce((s, v) => s + (v ?? 0), 0),
    totalHoursComparison: comp ? comp.hours.reduce((s, v) => s + (v ?? 0), 0) : 0,
  };
}

export async function getSalesTrendKpiData(
  ctx: SalesTrendContext,
  params: SalesTrendKpiQueryParams,
): Promise<SalesTrendKpiData> {
  const paramsForPeriod: SalesTrendQueryParams = {
    ...params,
    metric: "netSales",
    groupBy: "none",
  };
  const { period, comparison, seriesGranularity, dataRange, periodType } = getPeriodAndComparison(
    paramsForPeriod,
    ctx.timezone,
    ctx.businessStartTime,
  );
  const comparisonRange = comparison ? { startAt: comparison.startAt, endAt: comparison.endAt } : null;

  const numDaysCurrent = getCalendarDayCountInRange(dataRange, ctx.timezone);
  const numDaysComparison = comparisonRange
    ? getCalendarDayCountInRange(comparisonRange, ctx.timezone)
    : 0;

  let totalNetSalesCurrent = 0;
  let totalTransactionsCurrent = 0;
  let totalNetSalesComparison = 0;
  let totalTransactionsComparison = 0;
  let totalHoursCurrent = 0;
  let totalHoursComparison = 0;

  const squareLocationId = ctx.location.squareLocationId?.trim();
  if (squareLocationId) {
    const square = await fetchSquareKpiTotals(
      squareLocationId,
      dataRange,
      comparisonRange,
      ctx,
      seriesGranularity,
      periodType,
    );
    totalNetSalesCurrent = square.totalNetSalesCurrent;
    totalTransactionsCurrent = square.totalTransactionsCurrent;
    totalNetSalesComparison = square.totalNetSalesComparison;
    totalTransactionsComparison = square.totalTransactionsComparison;
  }

  const homebaseLocationId = ctx.location.homebaseLocationId?.trim();
  if (homebaseLocationId) {
    try {
      const labor = await fetchLaborKpiTotals(
        homebaseLocationId,
        dataRange,
        comparisonRange,
        ctx,
        seriesGranularity,
        periodType,
      );
      totalHoursCurrent = labor.totalHoursCurrent;
      totalHoursComparison = labor.totalHoursComparison;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("invalid_date_range") || msg.includes("cannot exceed a month")) {
        throw new LaborDateRangeError("Your date range cannot exceed a month. Try a smaller range.");
      }
      throw err;
    }
  }

  return {
    periodRange: { startAt: period.startAt, endAt: period.endAt },
    comparisonRange,
    current: {
      totalNetSales: totalNetSalesCurrent,
      totalTransactions: totalTransactionsCurrent,
      totalHours: totalHoursCurrent,
      numDays: numDaysCurrent,
    },
    comparison: {
      totalNetSales: totalNetSalesComparison,
      totalTransactions: totalTransactionsComparison,
      totalHours: totalHoursComparison,
      numDays: numDaysComparison,
    },
  };
}

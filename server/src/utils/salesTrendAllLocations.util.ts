import type { Request } from 'express';
import type { LocationService } from '../services/location.service.js';
import {
  buildSalesTrendContext,
  getSalesTrendData,
  getSalesTrendKpiData,
  type SalesTrendQueryParams,
  type SalesTrendKpiQueryParams,
  type SalesTrendResult,
} from './salesTrendControllerHelpers.js';
import { resolveEffectiveAllowedLocationIds } from './locationScope.js';
import { generateDistinctColors } from './colorPalette.util.js';
import {
  getLocationFanoutConcurrency,
  mapWithConcurrency,
} from './boundedConcurrency.util.js';
import { getByIdWithCredentialsCached } from './perRequestCache.util.js';
import {
  summarizeAllLocationsTimings,
  timedPerLocation,
} from './allLocationsTiming.util.js';
import {
  buildPrefetchInputForLocation,
  prefetchAllLocationsDashboardData,
  type AllLocationsPrefetchInput,
  type AllLocationsPrefetchQueryDateFields,
} from './allLocationsDashboardPrefetch.util.js';
import { logger } from './logger.util.js';
import { performance } from 'node:perf_hooks';

async function prefetchForSalesTrend(params: {
  req: Request;
  ids: readonly string[];
  query: AllLocationsPrefetchQueryDateFields;
  locationService: LocationService;
}): Promise<void> {
  const { req, ids, query, locationService } = params;
  // Resolve creds for every location in parallel — this is per-request
  // cached, so the subsequent per-location workers reuse the same Promise.
  const creds = await Promise.all(
    ids.map((id) => getByIdWithCredentialsCached(req, locationService, id)),
  );
  const inputs: AllLocationsPrefetchInput[] = [];
  for (let i = 0; i < ids.length; i++) {
    const c = creds[i];
    if (!c) continue;
    const locationMongoId = ids[i];
    if (!locationMongoId) continue;
    const tz = c.location.timezone?.trim() ?? 'UTC';
    const bst = c.location.businessStartTime?.trim() ?? '00:00';
    inputs.push(
      buildPrefetchInputForLocation({
        locationMongoId,
        timezone: tz,
        businessStartTime: bst,
        query,
      }),
    );
  }
  if (inputs.length === 0) return;
  await prefetchAllLocationsDashboardData(inputs);
}

function sumNullableSeries(points: Array<(number | null)[]>) {
  const len = Math.max(0, ...points.map((p) => p.length));
  const out: (number | null)[] = [];
  for (let i = 0; i < len; i++) {
    let any = false;
    let total = 0;
    let allNull = true;
    for (const arr of points) {
      const v = arr[i];
      if (v == null) continue;
      allNull = false;
      any = true;
      total += v;
    }
    out[i] = allNull && !any ? null : total;
  }
  return out;
}

function emptyTrendData(query: SalesTrendQueryParams): SalesTrendResult['data'] {
  if (query.metric === 'netSales' && query.groupBy === 'source') {
    return { xAxisLabels: [], granularity: 'daily', series: [] };
  }
  return {
    xAxisLabels: [],
    granularity: 'daily',
    currentPeriod: [],
    comparisonPeriod: [],
    periodRange: { startAt: '', endAt: '' },
    comparisonRange: null,
  };
}

async function loadPerLocationTrendResults(params: {
  req: Request;
  ids: string[];
  query: SalesTrendQueryParams;
  locationService: LocationService;
}): Promise<{ results: SalesTrendResult[]; perLocationMs: number[] }> {
  const { req, ids, query, locationService } = params;
  const perLocationMs: number[] = [];
  const settled = await mapWithConcurrency(
    ids,
    getLocationFanoutConcurrency(),
    async (id): Promise<SalesTrendResult | null> => {
      const { value, ms } = await timedPerLocation<SalesTrendResult | null>(async () => {
        const withCreds = await getByIdWithCredentialsCached(
          req,
          locationService,
          id,
        );
        if (!withCreds) return null;
        const ctx = buildSalesTrendContext(
          withCreds.location,
          withCreds.squareAccessToken,
          withCreds.homebaseApiKey,
          withCreds.location._id,
        );
        return getSalesTrendData(ctx, { ...query, locationId: id });
      });
      perLocationMs.push(ms);
      return value;
    },
  );
  return {
    results: settled.filter((r): r is SalesTrendResult => r != null),
    perLocationMs,
  };
}

function mergeBySource(results: Array<Extract<SalesTrendResult, { kind: 'bySource' }>>): SalesTrendResult['data'] {
  const first = results[0];
  if (!first) return { xAxisLabels: [], granularity: 'daily', series: [] };
  const byKey = new Map<string, { id: string; label: string; color: string; data: number[] }>();
  const xAxisLabels = first.data.xAxisLabels;
  const granularity = first.data.granularity;
  for (const r of results) {
    for (const s of r.data.series) {
      const key = `${s.id}||${s.label}`;
      const existing =
        byKey.get(key) ??
        (() => {
          const base: { id: string; label: string; color: string; data: number[] } = {
            id: s.id,
            label: s.label,
            data: new Array<number>(xAxisLabels.length).fill(0),
            color: s.color || '#888888',
          };
          return base;
        })();
      for (let i = 0; i < existing.data.length; i++) {
        existing.data[i] = (existing.data[i] ?? 0) + (s.data[i] ?? 0);
      }
      byKey.set(key, existing);
    }
  }
  // Recompute a distinct palette for the merged series so colors don't repeat
  // when different locations produce overlapping/duplicate palettes.
  const merged = Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
  const colors = generateDistinctColors(merged.length, { nonAdjacent: true });
  const series = merged.map((s, i) => ({ ...s, color: colors[i] ?? s.color ?? '#888888' }));
  return { xAxisLabels, granularity, series };
}

function mergeSeries(results: Array<Extract<SalesTrendResult, { kind: 'series' }>>): SalesTrendResult['data'] {
  const first = results[0]?.data;
  if (!first) {
    return {
      xAxisLabels: [],
      granularity: 'daily',
      currentPeriod: [],
      comparisonPeriod: [],
      periodRange: { startAt: '', endAt: '' },
      comparisonRange: null,
    };
  }
  const currentPeriod = sumNullableSeries(results.map((r) => r.data.currentPeriod));
  const comparisonPeriod = sumNullableSeries(results.map((r) => r.data.comparisonPeriod));
  return {
    xAxisLabels: first.xAxisLabels,
    granularity: first.granularity,
    currentPeriod,
    comparisonPeriod,
    periodRange: first.periodRange,
    comparisonRange: first.comparisonRange,
    ...(first.comparisonPeriodTooltipLabels ? { comparisonPeriodTooltipLabels: first.comparisonPeriodTooltipLabels } : {}),
    ...(first.currentPeriodTooltipLabels ? { currentPeriodTooltipLabels: first.currentPeriodTooltipLabels } : {}),
  };
}

export async function buildAllLocationsSalesTrend(params: {
  req: Request;
  query: SalesTrendQueryParams;
  locationService: LocationService;
}): Promise<SalesTrendResult['data']> {
  const { req, query, locationService } = params;
  const ids = await resolveEffectiveAllowedLocationIds(req);
  if (ids.length === 0) return emptyTrendData(query);

  const tHandler = performance.now();
  // Collapse N×K per-location Mongo round-trips into 3 bulk queries; the
  // per-location workers below then hit primed in-process caches.
  await prefetchForSalesTrend({ req, ids, query, locationService });
  const { results, perLocationMs } = await loadPerLocationTrendResults({
    req,
    ids,
    query,
    locationService,
  });
  try {
    if (results.length === 0) return emptyTrendData(query);

    const bySourceResults = results.filter((r): r is Extract<SalesTrendResult, { kind: 'bySource' }> => r.kind === 'bySource');
    if (bySourceResults.length > 0) return mergeBySource(bySourceResults);

    const seriesResults = results.filter((r): r is Extract<SalesTrendResult, { kind: 'series' }> => r.kind === 'series');
    return mergeSeries(seriesResults);
  } finally {
    summarizeAllLocationsTimings({
      route: 'GET /sales-labor/sales-trend',
      locationCount: ids.length,
      totalMs: Math.round(performance.now() - tHandler),
      perLocationMs,
    });
  }
}

export async function buildAllLocationsSalesTrendKpi(params: {
  req: Request;
  query: SalesTrendKpiQueryParams;
  locationService: LocationService;
}): Promise<unknown> {
  const { req, query, locationService } = params;
  const ids = await resolveEffectiveAllowedLocationIds(req);
  if (ids.length === 0) {
    return {
      current: { totalNetSales: 0, totalTransactions: 0, totalHours: 0, numDays: 0 },
      comparison: { totalNetSales: 0, totalTransactions: 0, totalHours: 0, numDays: 0 },
      comparisonRange: null,
      periodRange: undefined,
    };
  }
  const tHandler = performance.now();
  await prefetchForSalesTrend({ req, ids, query, locationService });
  const tAfterPrefetch = performance.now();
  logger.info('[sales-trend-kpi] prefetch awaited, fanout starting', {
    locationCount: ids.length,
    concurrency: getLocationFanoutConcurrency(),
    prefetchMs: Math.round(tAfterPrefetch - tHandler),
  });
  const perLocationMs: number[] = [];
  const settled = await mapWithConcurrency(
    ids,
    getLocationFanoutConcurrency(),
    async (id): Promise<Awaited<ReturnType<typeof getSalesTrendKpiData>> | null> => {
      logger.info('[sales-trend-kpi] worker start', {
        locationMongoId: id,
        elapsedMs: Math.round(performance.now() - tAfterPrefetch),
      });
      const { value, ms } = await timedPerLocation<
        Awaited<ReturnType<typeof getSalesTrendKpiData>> | null
      >(async () => {
        const withCreds = await getByIdWithCredentialsCached(req, locationService, id);
        if (!withCreds) return null;
        const ctx = buildSalesTrendContext(
          withCreds.location,
          withCreds.squareAccessToken,
          withCreds.homebaseApiKey,
          withCreds.location._id,
        );
        return getSalesTrendKpiData(ctx, { ...query, locationId: id });
      });
      perLocationMs.push(ms);
      logger.info('[sales-trend-kpi] worker done', {
        locationMongoId: id,
        workerMs: ms,
      });
      return value;
    },
  );
  const rows: Array<Awaited<ReturnType<typeof getSalesTrendKpiData>>> = settled.filter(
    (r): r is Awaited<ReturnType<typeof getSalesTrendKpiData>> => r != null,
  );
  const logTimingDone = (): void => {
    summarizeAllLocationsTimings({
      route: 'GET /sales-labor/sales-trend-kpi',
      locationCount: ids.length,
      totalMs: Math.round(performance.now() - tHandler),
      perLocationMs,
    });
  };
  if (rows.length === 0) {
    logTimingDone();
    return {
      current: { totalNetSales: 0, totalTransactions: 0, totalHours: 0, numDays: 0 },
      comparison: { totalNetSales: 0, totalTransactions: 0, totalHours: 0, numDays: 0 },
      comparisonRange: null,
      periodRange: undefined,
    };
  }
  const first = rows[0];
  if (!first) {
    logTimingDone();
    return {
      current: { totalNetSales: 0, totalTransactions: 0, totalHours: 0, numDays: 0 },
      comparison: { totalNetSales: 0, totalTransactions: 0, totalHours: 0, numDays: 0 },
      comparisonRange: null,
      periodRange: undefined,
    };
  }
  const sumField = (path: 'current' | 'comparison', key: string) =>
    rows.reduce((acc, r) => acc + (Number((r as any)?.[path]?.[key]) || 0), 0);

  const out = {
    periodRange: first.periodRange,
    comparisonRange: first.comparisonRange,
    current: {
      totalNetSales: sumField('current', 'totalNetSales'),
      totalTransactions: sumField('current', 'totalTransactions'),
      totalHours: sumField('current', 'totalHours'),
      numDays: first.current?.numDays ?? 0,
    },
    comparison: {
      totalNetSales: sumField('comparison', 'totalNetSales'),
      totalTransactions: sumField('comparison', 'totalTransactions'),
      totalHours: sumField('comparison', 'totalHours'),
      numDays: first.comparison?.numDays ?? 0,
    },
  };
  logTimingDone();
  return out;
}


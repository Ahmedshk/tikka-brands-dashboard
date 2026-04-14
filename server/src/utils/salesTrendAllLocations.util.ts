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
  ids: string[];
  query: SalesTrendQueryParams;
  locationService: LocationService;
}): Promise<SalesTrendResult[]> {
  const { ids, query, locationService } = params;
  const results: SalesTrendResult[] = [];
  for (const id of ids) {
    const withCreds = await locationService.getByIdWithCredentials(id);
    if (!withCreds) continue;
    const ctx = buildSalesTrendContext(
      withCreds.location,
      withCreds.squareAccessToken,
      withCreds.homebaseApiKey,
      withCreds.location._id,
    );
    results.push(await getSalesTrendData(ctx, { ...query, locationId: id }));
  }
  return results;
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
  return { xAxisLabels, granularity, series: Array.from(byKey.values()) };
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

  const results = await loadPerLocationTrendResults({ ids, query, locationService });
  if (results.length === 0) return emptyTrendData(query);

  const bySourceResults = results.filter((r): r is Extract<SalesTrendResult, { kind: 'bySource' }> => r.kind === 'bySource');
  if (bySourceResults.length > 0) return mergeBySource(bySourceResults);

  const seriesResults = results.filter((r): r is Extract<SalesTrendResult, { kind: 'series' }> => r.kind === 'series');
  return mergeSeries(seriesResults);
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
  const rows: Array<Awaited<ReturnType<typeof getSalesTrendKpiData>>> = [];
  for (const id of ids) {
    const withCreds = await locationService.getByIdWithCredentials(id);
    if (!withCreds) continue;
    const ctx = buildSalesTrendContext(
      withCreds.location,
      withCreds.squareAccessToken,
      withCreds.homebaseApiKey,
      withCreds.location._id,
    );
    rows.push(await getSalesTrendKpiData(ctx, { ...query, locationId: id }));
  }
  if (rows.length === 0) {
    return {
      current: { totalNetSales: 0, totalTransactions: 0, totalHours: 0, numDays: 0 },
      comparison: { totalNetSales: 0, totalTransactions: 0, totalHours: 0, numDays: 0 },
      comparisonRange: null,
      periodRange: undefined,
    };
  }
  const first = rows[0];
  if (!first) {
    return {
      current: { totalNetSales: 0, totalTransactions: 0, totalHours: 0, numDays: 0 },
      comparison: { totalNetSales: 0, totalTransactions: 0, totalHours: 0, numDays: 0 },
      comparisonRange: null,
      periodRange: undefined,
    };
  }
  const sumField = (path: 'current' | 'comparison', key: string) =>
    rows.reduce((acc, r) => acc + (Number((r as any)?.[path]?.[key]) || 0), 0);

  return {
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
}


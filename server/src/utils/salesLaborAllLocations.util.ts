import type { Request } from 'express';
import type { LocationService } from '../services/location.service.js';
import type { SalesLaborKPIsData } from '../types/salesLabor.types.js';
import type { HourlyBreakdownResponseData } from './salesLaborControllerHelpers.js';
import {
  buildEmptyHourlyBreakdownData,
  buildEmptySalesLaborKPIs,
  buildHourlyBreakdownLabels,
  computeLaborCostPercentPerHour,
  fetchHourlyLaborCostPerHour,
  fetchHourlyNetSalesCentsBySlot,
  fetchLaborCostAndHours,
  fetchSquareOrderStatsAndSources,
  getSalesLaborRangeForPeriod,
  type SalesLaborPeriodParams,
} from './salesLaborControllerHelpers.js';
import {
  loadHomebaseTimecardsForMongoRange,
} from '../services/integrationCacheRead.service.js';
import { mergeSourcesOfSalesFromDailyRollupDocs } from './squareSourcesOfSalesMerge.util.js';
import { resolveEffectiveAllowedLocationIds } from './locationScope.js';
import {
  getLocationFanoutConcurrency,
  mapWithConcurrency,
} from './boundedConcurrency.util.js';
import { getByIdWithCredentialsCached } from './perRequestCache.util.js';
import {
  summarizeAllLocationsTimings,
  timedPerLocation,
} from './allLocationsTiming.util.js';
import { performance } from 'node:perf_hooks';
import {
  prefetchAllLocationsDashboardData,
  type AllLocationsPrefetchInput,
} from './allLocationsDashboardPrefetch.util.js';

/**
 * Build prefetch inputs from the resolved location ids + period and seed the
 * process-level rollup caches in a handful of bulk `$in` queries. Returns
 * `void` — subsequent per-location workers read from the seeded caches.
 *
 * Locations that fail to resolve (missing creds, missing TZ) are skipped:
 * those workers would short-circuit downstream anyway, so leaving them out of
 * the prefetch keeps the bulk queries lean.
 */
async function prefetchSalesLaborCachesForLocations(args: {
  req: Request;
  locationService: LocationService;
  effectiveIds: string[];
  period: SalesLaborPeriodParams;
}): Promise<void> {
  const { req, locationService, effectiveIds, period } = args;
  // Load every location's credentials in parallel. The previous serial
  // `for await` loop dominated wall-clock time (9 locations × Atlas
  // round-trip ≈ 12-14s of preamble before the actual bulk prefetch ran).
  // Promise.all collapses this to the cost of the slowest single lookup
  // (~1-2s) — the per-request cache still guards against duplicate work
  // inside this same request.
  const credsPerId = await Promise.all(
    effectiveIds.map((id) => getByIdWithCredentialsCached(req, locationService, id)),
  );
  const inputs: AllLocationsPrefetchInput[] = [];
  for (let i = 0; i < effectiveIds.length; i++) {
    const id = effectiveIds[i]!;
    const withCreds = credsPerId[i];
    if (!withCreds) continue;
    const { location } = withCreds;
    const timezone = location.timezone?.trim();
    if (!timezone) continue;
    const businessStartTime = location.businessStartTime?.trim() ?? '00:00';
    const range = getSalesLaborRangeForPeriod(
      {
        timezone: location.timezone,
        businessStartTime: location.businessStartTime,
        squareLocationId: location.squareLocationId,
        homebaseLocationId: location.homebaseLocationId,
      },
      period,
    );
    inputs.push({
      locationMongoId: id,
      ranges: [range],
      timezone,
      businessStartTime,
    });
  }
  if (inputs.length === 0) return;
  // Single-phase prefetch: rollup caches only. The previous "phase 2" that
  // bulk-fetched raw orders + timecards for uncovered sub-ranges has been
  // removed — the read path now sums hourly rollups for those sub-ranges
  // instead of scanning raw documents (see
  // {@link hourlyRollupSubRangeSum.util.ts}). With the raw-scan path
  // demoted to a tertiary fallback that rarely fires, the bulk raw prefetch
  // was paying for itself only in pathological cases and otherwise just
  // added Mongo work + Node memory pressure on the hot path.
  await prefetchAllLocationsDashboardData(inputs);
}

function sum(vals: Array<number | null | undefined>): number | null {
  let any = false;
  let total = 0;
  for (const v of vals) {
    if (v == null) continue;
    any = true;
    total += v;
  }
  return any ? total : null;
}

function toTimesheetRow(
  tc: {
    first_name?: string | null;
    last_name?: string | null;
    role?: string | null;
    clock_in?: string | null;
    clock_out?: string | null;
    labor?: { regular_hours?: number | null } | null;
    timebreaks?: Array<{ start_at?: string | null; end_at?: string | null }> | null;
  },
  location: { storeName?: string | null },
  locationId: string,
): unknown {
  const name = [tc.first_name, tc.last_name].filter(Boolean).join(' ') || 'Unknown';
  const role = tc.role ?? '';
  const clockIn = tc.clock_in ?? null;
  const clockOut = tc.clock_out ?? null;

  let totalHours = tc.labor?.regular_hours ?? 0;
  if (!clockOut && clockIn) {
    const elapsed = (Date.now() - new Date(clockIn).getTime()) / 3_600_000;
    totalHours = Math.round(elapsed * 100) / 100;
  }

  let status: 'On Clock' | 'On Break' | 'Clocked Out' = 'Clocked Out';
  if (!clockOut) {
    const onBreak = tc.timebreaks?.some((tb) => tb.start_at && !tb.end_at);
    status = onBreak ? 'On Break' : 'On Clock';
  }

  return {
    name,
    role,
    clockIn,
    clockOut,
    totalHours,
    status,
    locationId,
    locationName: location.storeName,
  };
}

export async function buildAllLocationsSalesLaborKpis(params: {
  req: Request;
  metrics: string[];
  locationService: LocationService;
  period: SalesLaborPeriodParams;
}): Promise<Partial<SalesLaborKPIsData> | SalesLaborKPIsData> {
  const { req, metrics, locationService, period } = params;
  const effectiveIds = await resolveEffectiveAllowedLocationIds(req);
  if (effectiveIds.length === 0) return buildEmptySalesLaborKPIs();

  const tHandler = performance.now();
  // Prime the daily + hourly rollup caches in one bulk pass before fanning
  // out per-location. Each worker's calls into the rollup readers then hit
  // the in-process cache instead of issuing its own Mongo round-trip.
  await prefetchSalesLaborCachesForLocations({
    req,
    locationService,
    effectiveIds,
    period,
  });
  const perLocationMs: number[] = [];
  const logTimingDone = (count: number): void => {
    summarizeAllLocationsTimings({
      route: 'GET /sales-labor/kpis',
      locationCount: count,
      totalMs: Math.round(performance.now() - tHandler),
      perLocationMs,
    });
  };

  const perLoc = await Promise.all(
    effectiveIds.map(async (id) => {
      const { value, ms } = await timedPerLocation(async () => {
        const withCreds = await getByIdWithCredentialsCached(req, locationService, id);
        if (!withCreds) return null;
        const { location, squareAccessToken, homebaseApiKey } = withCreds;
        const timezone = location.timezone?.trim();
        if (!timezone) return null;
        const range = getSalesLaborRangeForPeriod(
          {
            timezone: location.timezone,
            businessStartTime: location.businessStartTime,
            squareLocationId: location.squareLocationId,
            homebaseLocationId: location.homebaseLocationId,
          },
          period,
        );

        const squareLocationId = location.squareLocationId?.trim();
        const homebaseLocationId = location.homebaseLocationId?.trim();

        const [squareData, laborData] = await Promise.all([
          squareLocationId
            ? fetchSquareOrderStatsAndSources(
                squareLocationId,
                range,
                squareAccessToken ?? undefined,
                id,
                {
                  timezone,
                  businessStartTime: location.businessStartTime?.trim() ?? '00:00',
                },
              )
            : Promise.resolve(null),
          homebaseLocationId
            ? fetchLaborCostAndHours(
                homebaseLocationId,
                range,
                homebaseApiKey ?? undefined,
                id,
                { timezone, businessStartTime: location.businessStartTime?.trim() ?? "00:00" },
              )
            : Promise.resolve(null),
        ]);

        return { squareData, laborData };
      });
      perLocationMs.push(ms);
      return value;
    }),
  );

  const usable = perLoc.filter((p): p is NonNullable<typeof p> => p != null);
  if (usable.length === 0) {
    logTimingDone(0);
    return buildEmptySalesLaborKPIs();
  }

  const actualTotalSales = sum(usable.map((u) => u.squareData?.actualTotalSales));
  const transactionCount = sum(usable.map((u) => u.squareData?.transactionCount));
  const totalDiscounts = sum(usable.map((u) => u.squareData?.totalDiscounts));
  const totalRefunds = sum(usable.map((u) => u.squareData?.totalRefunds));
  const totalRefundCount = sum(usable.map((u) => u.squareData?.totalRefundCount));
  const laborCost = sum(usable.map((u) => u.laborData?.laborCost));
  const totalHours = sum(usable.map((u) => u.laborData?.totalHours));

  const actualLaborCostPercent =
    actualTotalSales != null && laborCost != null && actualTotalSales > 0
      ? (laborCost / actualTotalSales) * 100
      : null;
  const salesPerManHour =
    actualTotalSales != null && totalHours != null && totalHours > 0
      ? actualTotalSales / totalHours
      : null;
  const averageCheck =
    actualTotalSales != null && transactionCount != null && transactionCount > 0
      ? actualTotalSales / transactionCount
      : null;

  const sourcesOfSales = mergeSourcesOfSalesFromDailyRollupDocs(
    usable.map((u) => ({ sourcesOfSales: u.squareData?.sourcesOfSales ?? [] })),
  ) as SalesLaborKPIsData['sourcesOfSales'];

  const full: SalesLaborKPIsData = {
    actualTotalSales,
    actualLaborCostPercent,
    totalHours,
    salesPerManHour,
    transactionCount,
    averageCheck,
    totalDiscounts,
    totalRefunds,
    totalRefundCount,
    sourcesOfSales,
  };

  if (metrics.length === 0) {
    logTimingDone(usable.length);
    return buildEmptySalesLaborKPIs();
  }
  // Filter to requested metrics (mirror buildSalesLaborKpisResponseData behavior).
  const filtered: Partial<SalesLaborKPIsData> = {};
  const fullRecord = full as unknown as Record<string, unknown>;
  for (const k of metrics) {
    if (k in full) (filtered as Record<string, unknown>)[k] = fullRecord[k];
  }
  if (metrics.includes('totalRefunds')) filtered.totalRefundCount = full.totalRefundCount;
  logTimingDone(usable.length);
  return filtered;
}

export async function buildAllLocationsHourlyBreakdown(params: {
  req: Request;
  locationService: LocationService;
  period: SalesLaborPeriodParams;
}): Promise<HourlyBreakdownResponseData> {
  const { req, locationService, period } = params;
  const effectiveIds = await resolveEffectiveAllowedLocationIds(req);
  if (effectiveIds.length === 0) {
    const labels = buildHourlyBreakdownLabels('00:00');
    return buildEmptyHourlyBreakdownData(labels);
  }

  const tHandler = performance.now();
  // Prime Square + Homebase hourly rollup caches before the fan-out so each
  // worker's `tryGet*FromRollups` call resolves from in-process state.
  await prefetchSalesLaborCachesForLocations({
    req,
    locationService,
    effectiveIds,
    period,
  });
  const perLocationMs: number[] = [];
  const perLoc = await Promise.all(
    effectiveIds.map(async (id) => {
      const { value, ms } = await timedPerLocation(async () => {
        const withCreds = await getByIdWithCredentialsCached(req, locationService, id);
        if (!withCreds) return null;
        const { location, squareAccessToken, homebaseApiKey } = withCreds;
        const timezone = location.timezone?.trim();
        if (!timezone) return null;
        const businessStartTime = location.businessStartTime?.trim() ?? '00:00';
        const range = getSalesLaborRangeForPeriod(
          {
            timezone: location.timezone,
            businessStartTime: location.businessStartTime,
            squareLocationId: location.squareLocationId,
            homebaseLocationId: location.homebaseLocationId,
          },
          period,
        );

        const squareLocationId = location.squareLocationId?.trim();
        const homebaseLocationId = location.homebaseLocationId?.trim();

        const [netSalesCentsBySlot, laborCostPerHour] = await Promise.all([
          squareLocationId
            ? fetchHourlyNetSalesCentsBySlot(
                squareLocationId,
                range,
                timezone,
                businessStartTime,
                squareAccessToken ?? undefined,
                id,
              )
            : Promise.resolve(new Array<number>(24).fill(0)),
          homebaseLocationId
            ? fetchHourlyLaborCostPerHour(
                homebaseLocationId,
                range,
                timezone,
                businessStartTime,
                homebaseApiKey ?? undefined,
                id,
              )
            : Promise.resolve(new Array<number>(24).fill(0)),
        ]);

        return { businessStartTime, netSalesCentsBySlot, laborCostPerHour };
      });
      perLocationMs.push(ms);
      return value;
    }),
  );

  const logTimingDone = (count: number): void => {
    summarizeAllLocationsTimings({
      route: 'GET /sales-labor/hourly-breakdown',
      locationCount: count,
      totalMs: Math.round(performance.now() - tHandler),
      perLocationMs,
    });
  };

  const usable = perLoc.filter((p): p is NonNullable<typeof p> => p != null);
  const businessStartTime = usable[0]?.businessStartTime ?? '00:00';
  const labels = buildHourlyBreakdownLabels(businessStartTime);
  if (usable.length === 0) {
    logTimingDone(0);
    return buildEmptyHourlyBreakdownData(labels);
  }

  const netSalesCentsBySlot = new Array<number>(24).fill(0);
  const laborCostPerHour = new Array<number>(24).fill(0);

  for (const u of usable) {
    for (let i = 0; i < 24; i++) {
      netSalesCentsBySlot[i] = (netSalesCentsBySlot[i] ?? 0) + (u.netSalesCentsBySlot?.[i] ?? 0);
      laborCostPerHour[i] = (laborCostPerHour[i] ?? 0) + (u.laborCostPerHour?.[i] ?? 0);
    }
  }

  const netSalesPerHour = netSalesCentsBySlot.map((c) => c / 100);
  const laborCostPercentPerHour = computeLaborCostPercentPerHour(netSalesPerHour, laborCostPerHour);
  logTimingDone(usable.length);
  return { labels, netSalesPerHour, laborCostPercentPerHour };
}

export async function buildAllLocationsTimesheetRows(params: {
  req: Request;
  locationService: LocationService;
  period: SalesLaborPeriodParams;
}): Promise<unknown[]> {
  const { req, locationService, period } = params;
  const effectiveIds = await resolveEffectiveAllowedLocationIds(req);
  if (effectiveIds.length === 0) return [];

  const tHandler = performance.now();
  const perLocationMs: number[] = [];
  const perLocationRows = await mapWithConcurrency(
    effectiveIds,
    getLocationFanoutConcurrency(),
    async (id): Promise<unknown[]> => {
      const { value, ms } = await timedPerLocation<unknown[]>(async () => {
        const withCreds = await getByIdWithCredentialsCached(req, locationService, id);
        if (!withCreds) return [];
        const { location } = withCreds;
        const homebaseLocationId = location.homebaseLocationId?.trim();
        if (!homebaseLocationId) return [];

        const { startAt, endAt } = getSalesLaborRangeForPeriod(
          {
            timezone: location.timezone,
            businessStartTime: location.businessStartTime,
            squareLocationId: location.squareLocationId,
            homebaseLocationId: location.homebaseLocationId,
          },
          period,
        );
        const timecards = await loadHomebaseTimecardsForMongoRange(id, { startAt, endAt });
        return timecards.map((tc) => toTimesheetRow(tc, location, id));
      });
      perLocationMs.push(ms);
      return value;
    },
  );

  summarizeAllLocationsTimings({
    route: 'GET /sales-labor/timesheet',
    locationCount: effectiveIds.length,
    totalMs: Math.round(performance.now() - tHandler),
    perLocationMs,
  });
  return perLocationRows.flat();
}


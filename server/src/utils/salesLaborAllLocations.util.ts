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
  getSalesLaborTimeRange,
} from './salesLaborControllerHelpers.js';
import {
  loadHomebaseTimecardsForMongoRange,
} from '../services/integrationCacheRead.service.js';
import {
  getDatePartsInTz,
  getStartOfDayUtc,
  getEndOfDayUtc,
} from './salesTrendDateRange.util.js';
import { mergeSourcesOfSalesFromDailyRollupDocs } from './squareSourcesOfSalesMerge.util.js';
import { resolveEffectiveAllowedLocationIds } from './locationScope.js';

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
}): Promise<Partial<SalesLaborKPIsData> | SalesLaborKPIsData> {
  const { req, metrics, locationService } = params;
  const effectiveIds = await resolveEffectiveAllowedLocationIds(req);
  if (effectiveIds.length === 0) return buildEmptySalesLaborKPIs();

  const perLoc = await Promise.all(
    effectiveIds.map(async (id) => {
      const withCreds = await locationService.getByIdWithCredentials(id);
      if (!withCreds) return null;
      const { location, squareAccessToken, homebaseApiKey } = withCreds;
      const timezone = location.timezone?.trim();
      if (!timezone) return null;
      const range = getSalesLaborTimeRange({
        timezone: location.timezone,
        businessStartTime: location.businessStartTime,
        squareLocationId: location.squareLocationId,
        homebaseLocationId: location.homebaseLocationId,
      });

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
          ? fetchLaborCostAndHours(homebaseLocationId, range, homebaseApiKey ?? undefined, id)
          : Promise.resolve(null),
      ]);

      return { squareData, laborData };
    }),
  );

  const usable = perLoc.filter((p): p is NonNullable<typeof p> => p != null);
  if (usable.length === 0) return buildEmptySalesLaborKPIs();

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

  // Filter to requested metrics (mirror buildSalesLaborKpisResponseData behavior).
  if (metrics.length === 0) return buildEmptySalesLaborKPIs();
  const filtered: Partial<SalesLaborKPIsData> = {};
  const fullRecord = full as unknown as Record<string, unknown>;
  for (const k of metrics) {
    if (k in full) (filtered as Record<string, unknown>)[k] = fullRecord[k];
  }
  if (metrics.includes('totalRefunds')) filtered.totalRefundCount = full.totalRefundCount;
  return filtered;
}

export async function buildAllLocationsHourlyBreakdown(params: {
  req: Request;
  locationService: LocationService;
}): Promise<HourlyBreakdownResponseData> {
  const { req, locationService } = params;
  const effectiveIds = await resolveEffectiveAllowedLocationIds(req);
  if (effectiveIds.length === 0) {
    const labels = buildHourlyBreakdownLabels('00:00');
    return buildEmptyHourlyBreakdownData(labels);
  }

  const perLoc = await Promise.all(
    effectiveIds.map(async (id) => {
      const withCreds = await locationService.getByIdWithCredentials(id);
      if (!withCreds) return null;
      const { location, squareAccessToken, homebaseApiKey } = withCreds;
      const timezone = location.timezone?.trim();
      if (!timezone) return null;
      const businessStartTime = location.businessStartTime?.trim() ?? '00:00';
      const range = getSalesLaborTimeRange({
        timezone: location.timezone,
        businessStartTime: location.businessStartTime,
        squareLocationId: location.squareLocationId,
        homebaseLocationId: location.homebaseLocationId,
      });

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
    }),
  );

  const usable = perLoc.filter((p): p is NonNullable<typeof p> => p != null);
  const businessStartTime = usable[0]?.businessStartTime ?? '00:00';
  const labels = buildHourlyBreakdownLabels(businessStartTime);
  if (usable.length === 0) return buildEmptyHourlyBreakdownData(labels);

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
  return { labels, netSalesPerHour, laborCostPercentPerHour };
}

export async function buildAllLocationsTimesheetRows(params: {
  req: Request;
  locationService: LocationService;
}): Promise<unknown[]> {
  const { req, locationService } = params;
  const effectiveIds = await resolveEffectiveAllowedLocationIds(req);
  if (effectiveIds.length === 0) return [];

  const allRows: unknown[] = [];
  for (const id of effectiveIds) {
    const withCreds = await locationService.getByIdWithCredentials(id);
    if (!withCreds) continue;
    const { location } = withCreds;
    const timezone = location.timezone?.trim() || 'UTC';
    const homebaseLocationId = location.homebaseLocationId?.trim();
    if (!homebaseLocationId) continue;

    // Reuse existing controller behavior by calling the same cache read path.
    // We intentionally don’t attempt to dedupe staff across locations.
    const { y, m, d } = getDatePartsInTz(new Date(), timezone);
    const startAt = getStartOfDayUtc(y, m, d, timezone).toISOString();
    const endAt = getEndOfDayUtc(y, m, d, timezone).toISOString();
    const timecards = await loadHomebaseTimecardsForMongoRange(id, { startAt, endAt });
    for (const tc of timecards) {
      allRows.push(toTimesheetRow(tc, location, id));
    }
  }

  return allRows;
}


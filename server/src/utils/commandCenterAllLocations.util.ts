import type { Request } from 'express';
import type { GoalService } from '../services/goal.service.js';
import type { LocationService } from '../services/location.service.js';
import {
  fetchHourlyNetSalesCentsBySlotFromCache,
} from '../services/integrationCacheRead.service.js';
import type { LocationForKpi, HourlySalesRow, LaborCostStatus } from '../types/commandCenter.types.js';
import {
  getLaborCostGoals,
  getRangeToday,
  getRangeWeekToDate,
  fetchTodayOnlyKpis,
  fetchWeekToDateKpis,
  buildTodayOnlyData,
  buildWeekToDateData,
} from './commandCenterKpiLogic.js';
import { buildEmptyHourlySalesRows } from './commandCenterHelpers.js';
import { getBusinessStartTimeRange } from './timezone.util.js';
import {
  addCalendarDaysToBusinessDateKey,
  businessDateKeyForInstant,
  businessDayUtcRangeIsoStrings,
} from './businessDayUtcRange.util.js';
import { resolveEffectiveAllowedLocationIds } from './locationScope.js';
import {
  getLocationFanoutConcurrency,
  mapWithConcurrency,
} from './boundedConcurrency.util.js';
import { getByIdCached } from './perRequestCache.util.js';
import {
  summarizeAllLocationsTimings,
  timedPerLocation,
} from './allLocationsTiming.util.js';
import {
  prefetchAllLocationsDashboardData,
  type AllLocationsPrefetchInput,
} from './allLocationsDashboardPrefetch.util.js';
import { performance } from 'node:perf_hooks';

function sumNullable(vals: Array<number | null | undefined>): number | null {
  let any = false;
  let total = 0;
  for (const v of vals) {
    if (v == null) continue;
    any = true;
    total += v;
  }
  return any ? total : null;
}

function laborPercent(netSales: number | null, laborCost: number | null): number | null {
  if (netSales == null || laborCost == null || netSales <= 0) return null;
  return (laborCost / netSales) * 100;
}

function laborStatus(percent: number | null, goal: number): LaborCostStatus {
  if (percent == null) return null;
  return percent < goal ? 'green' : 'red';
}

async function loadPerLocationContext(params: {
  req: Request;
  wantLaborCost: boolean;
  goalService: GoalService;
  locationService: LocationService;
  toLocationForKpi: (location: {
    timezone?: string;
    businessStartTime?: string | null;
    squareLocationId?: string | null;
    homebaseLocationId?: string | null;
  }) => LocationForKpi;
}): Promise<
  Array<{
    locationMongoId: string;
    loc: LocationForKpi;
    laborCostGoal: number;
    laborCostGoalTolerance: number;
  }>
> {
  const { req, wantLaborCost, goalService, locationService, toLocationForKpi } = params;
  const effectiveIds = await resolveEffectiveAllowedLocationIds(req);

  const settled = await mapWithConcurrency(
    effectiveIds,
    getLocationFanoutConcurrency(),
    async (id) => {
      const location = await getByIdCached(req, locationService, id);
      if (!location) return null;
      const loc = toLocationForKpi(location);
      const goals = await getLaborCostGoals(goalService, id, loc, wantLaborCost);
      return {
        locationMongoId: id,
        loc,
        laborCostGoal: goals.laborCostGoal,
        laborCostGoalTolerance: goals.laborCostGoalTolerance,
      };
    },
  );

  return settled.filter((p): p is NonNullable<typeof p> => p != null);
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function buildAllLocationsCommandCenterKpis(params: {
  req: Request;
  metrics: string[];
  periods: Array<'today' | 'weekToDate'> | undefined;
  wantNetSales: boolean;
  wantLaborCost: boolean;
  wantReviewRating: boolean;
  goalService: GoalService;
  locationService: LocationService;
  toLocationForKpi: (location: {
    timezone?: string;
    businessStartTime?: string | null;
    squareLocationId?: string | null;
    homebaseLocationId?: string | null;
  }) => LocationForKpi;
}): Promise<{ dual: boolean; data: unknown }> {
  const {
    req,
    metrics,
    periods,
    wantNetSales,
    wantLaborCost,
    wantReviewRating,
    goalService,
    locationService,
    toLocationForKpi,
  } = params;

  const wantWeekToDate = Array.isArray(periods) && periods.includes('weekToDate');
  const tHandler = performance.now();
  const perLocationMs: number[] = [];
  const route = wantWeekToDate
    ? 'GET /command-center/kpis (weekToDate)'
    : 'GET /command-center/kpis (today)';

  const perLoc = await loadPerLocationContext({
    req,
    wantLaborCost,
    goalService,
    locationService,
    toLocationForKpi,
  });

  if (perLoc.length === 0) {
    summarizeAllLocationsTimings({
      route,
      locationCount: 0,
      totalMs: Math.round(performance.now() - tHandler),
      perLocationMs,
    });
    if (wantWeekToDate) return { dual: true, data: { today: {}, weekToDate: {} } };
    return { dual: false, data: {} };
  }

  const avgGoal = wantLaborCost ? average(perLoc.map((p) => p.laborCostGoal)) : 0;
  const avgTol = wantLaborCost ? average(perLoc.map((p) => p.laborCostGoalTolerance)) : 0;

  // Up-front bulk prefetch: each per-location worker below pulls from daily
  // rollups (SquareOrderDailyRollup, HomebaseTimecardDailyRollup) plus a
  // raw-orders / timecards fallback. The default per-location pattern issues
  // multiple Mongo round-trips, each ~240ms RTT, which dominates at 9
  // locations. The prefetch collapses those into a handful of bulk queries
  // that seed the in-process caches the readers consult.
  const prefetchInputs: AllLocationsPrefetchInput[] = perLoc.map((p) => {
    const ranges = wantWeekToDate
      ? [getRangeToday(p.loc), getRangeWeekToDate(p.loc)]
      : [getRangeToday(p.loc)];
    return {
      locationMongoId: p.locationMongoId,
      ranges,
      timezone: p.loc.timezone ?? 'UTC',
      businessStartTime: p.loc.businessStartTime ?? '00:00',
    };
  });
  if (prefetchInputs.length > 0) {
    await prefetchAllLocationsDashboardData(prefetchInputs);
  }

  if (wantWeekToDate) {
    const rangeByLoc = perLoc.map((p) => ({
      ...p,
      rangeToday: getRangeToday(p.loc),
      rangeWeekToDate: getRangeWeekToDate(p.loc),
    }));
    const results = await Promise.all(
      rangeByLoc.map(async (p) => {
        const { value, ms } = await timedPerLocation(() =>
          fetchWeekToDateKpis({
            locationMongoId: p.locationMongoId,
            location: p.loc,
            rangeToday: p.rangeToday,
            rangeWeekToDate: p.rangeWeekToDate,
            wantNetSales,
            wantLaborCost,
            laborCostGoal: avgGoal,
          }),
        );
        perLocationMs.push(ms);
        return value;
      }),
    );

    const netSalesToday = sumNullable(results.map((r) => r.netSalesToday));
    const netSalesWeekToDate = sumNullable(results.map((r) => r.netSalesWeekToDate));
    const laborCostToday = sumNullable(results.map((r) => r.laborCostToday));
    const laborCostWeekToDate = sumNullable(results.map((r) => r.laborCostWeekToDate));

    const pctToday = laborPercent(netSalesToday, laborCostToday);
    const pctWtd = laborPercent(netSalesWeekToDate, laborCostWeekToDate);

    const { todayData, weekToDateData } = buildWeekToDateData(
      metrics,
      wantNetSales,
      wantLaborCost,
      wantReviewRating,
      {
        netSalesToday,
        netSalesWeekToDate,
        laborCostToday,
        laborCostWeekToDate,
        laborCostPercentToday: pctToday,
        laborCostStatusToday: laborStatus(pctToday, avgGoal),
        laborCostPercentWeekToDate: pctWtd,
        laborCostStatusWeekToDate: laborStatus(pctWtd, avgGoal),
      },
      avgGoal,
      avgTol,
    );

    if (wantReviewRating) {
      todayData.reviewRating = null;
      todayData.reviewCount = null;
      weekToDateData.reviewRating = null;
      weekToDateData.reviewCount = null;
    }

    summarizeAllLocationsTimings({
      route,
      locationCount: perLoc.length,
      totalMs: Math.round(performance.now() - tHandler),
      perLocationMs,
    });
    return { dual: true, data: { today: todayData, weekToDate: weekToDateData } };
  }

  const results = await Promise.all(
    perLoc.map(async (p) => {
      const { value, ms } = await timedPerLocation(() =>
        fetchTodayOnlyKpis(
          p.locationMongoId,
          p.loc,
          getRangeToday(p.loc),
          wantNetSales,
          wantLaborCost,
          avgGoal,
        ),
      );
      perLocationMs.push(ms);
      return value;
    }),
  );

  const netSalesToday = sumNullable(results.map((r) => r.netSalesToday));
  const laborCostToday = sumNullable(results.map((r) => r.laborCostToday));
  const pct = laborPercent(netSalesToday, laborCostToday);

  const data = buildTodayOnlyData(
    metrics,
    wantNetSales,
    wantLaborCost,
    wantReviewRating,
    {
      netSalesToday,
      laborCostToday,
      laborCostPercentToday: pct,
      laborCostStatus: laborStatus(pct, avgGoal),
    },
    avgGoal,
    avgTol,
  );

  if (wantReviewRating) {
    data.reviewRating = null;
    data.reviewCount = null;
  }

  summarizeAllLocationsTimings({
    route,
    locationCount: perLoc.length,
    totalMs: Math.round(performance.now() - tHandler),
    perLocationMs,
  });
  return { dual: false, data };
}

export async function buildAllLocationsHourlySales(params: {
  req: Request;
  locationService: LocationService;
}): Promise<HourlySalesRow[]> {
  const { req, locationService } = params;
  const effectiveIds = await resolveEffectiveAllowedLocationIds(req);
  if (effectiveIds.length === 0) return buildEmptyHourlySalesRows();

  const perLoc = await Promise.all(
    effectiveIds.map(async (id) => {
      const location = await getByIdCached(req, locationService, id);
      if (!location) return null;
      const timezone = location.timezone?.trim();
      const squareLocationId = location.squareLocationId?.trim();
      if (!timezone || !squareLocationId) return null;

      const businessStartTime = location.businessStartTime?.trim() ?? '00:00';
      const todayRange = getBusinessStartTimeRange(timezone, businessStartTime);
      const todayKey = businessDateKeyForInstant(new Date(), timezone, businessStartTime);
      const lastWeekKey = addCalendarDaysToBusinessDateKey(todayKey, -7);
      const lastWeekRange = businessDayUtcRangeIsoStrings(timezone, businessStartTime, lastWeekKey);

      const [todaySlots, lastWeekSlots] = await Promise.all([
        fetchHourlyNetSalesCentsBySlotFromCache(
          id,
          todayRange,
          timezone,
          businessStartTime,
          'GET /command-center/hourly-sales today (all-locations)',
        ),
        fetchHourlyNetSalesCentsBySlotFromCache(
          id,
          lastWeekRange,
          timezone,
          businessStartTime,
          'GET /command-center/hourly-sales last week (all-locations)',
        ),
      ]);

      const startHour = Number.parseInt(businessStartTime.split(':')[0] ?? '0', 10);
      return { startHour, todaySlots, lastWeekSlots };
    }),
  );

  const usable = perLoc.filter((x): x is NonNullable<typeof x> => x != null);
  if (usable.length === 0) return buildEmptyHourlySalesRows();

  const referenceStartHour = usable[0]?.startHour ?? 0;
  const rows: HourlySalesRow[] = [];
  for (let slot = 0; slot < 24; slot++) {
    const hour24 = (referenceStartHour + slot) % 24;
    let todayCents = 0;
    let lastWeekCents = 0;
    for (const u of usable) {
      todayCents += u.todaySlots[slot] ?? 0;
      lastWeekCents += u.lastWeekSlots[slot] ?? 0;
    }
    rows.push({
      hour: `${String(hour24).padStart(2, '0')}:00`,
      today: todayCents / 100,
      last_week: lastWeekCents / 100,
    });
  }

  return rows;
}


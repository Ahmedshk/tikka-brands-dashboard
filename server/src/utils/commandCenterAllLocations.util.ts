import type { Request } from 'express';
import type { GoalService } from '../services/goal.service.js';
import type { LocationService } from '../services/location.service.js';
import {
  fetchHourlyNetSalesCentsBySlotFromCache,
} from '../services/integrationCacheRead.service.js';
import type { LocationForKpi, HourlySalesRow, LaborCostStatus, Period } from '../types/commandCenter.types.js';
import {
  getLaborCostGoals,
  getRangeForPeriod,
  fetchKpisForRange,
  buildMultiPeriodResponse,
  buildTodayOnlyData,
  buildWeekToDateData,
  type PeriodRangeKpis,
  type ReviewRatingKpiData,
} from './commandCenterKpiLogic.js';
import { getReviewRatingSummariesForLocations } from './googleBusinessReviewAggregation.util.js';
import { buildEmptyHourlySalesRows } from './commandCenterHelpers.js';
import { getBusinessStartTimeRange } from './timezone.util.js';
import {
  addCalendarDaysToBusinessDateKey,
  businessDateKeyForInstant,
  businessDayUtcRangeIsoStrings,
} from './businessDayUtcRange.util.js';
import { resolveTargetLocationIds } from './locationScope.js';
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
  const effectiveIds = await resolveTargetLocationIds(req);

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

function summariesToReviewRatingData(
  summaries: Awaited<ReturnType<typeof getReviewRatingSummariesForLocations>>,
): ReviewRatingKpiData {
  return {
    todayRating: summaries.today.averageRating,
    todayCount: summaries.today.reviewCount,
    weekToDateRating: summaries.weekToDate.averageRating,
    weekToDateCount: summaries.weekToDate.reviewCount,
    monthToDateRating: summaries.monthToDate.averageRating,
    monthToDateCount: summaries.monthToDate.reviewCount,
    lastWeekRating: summaries.lastWeek.averageRating,
    lastWeekCount: summaries.lastWeek.reviewCount,
    overallRating: summaries.overall.averageRating,
    overallCount: summaries.overall.reviewCount,
  };
}

export async function buildAllLocationsCommandCenterKpis(params: {
  req: Request;
  metrics: string[];
  periods: Period[] | undefined;
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

  const requestedPeriods: Period[] =
    Array.isArray(periods) && periods.length > 0 ? periods : ['today'];
  const wantsMultiPeriod = requestedPeriods.length > 1;
  const wantLegacyWeekToDateDual =
    requestedPeriods.length === 1 && requestedPeriods[0] === 'weekToDate';
  const fetchPeriods: Period[] = wantLegacyWeekToDateDual
    ? ['today', 'weekToDate']
    : requestedPeriods;
  const tHandler = performance.now();
  const perLocationMs: number[] = [];
  const route = wantsMultiPeriod || wantLegacyWeekToDateDual
    ? 'GET /command-center/kpis (multi-period)'
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
    if (wantsMultiPeriod) {
      const emptyMulti: Record<string, unknown> = {};
      for (const period of requestedPeriods) {
        emptyMulti[period] = {};
      }
      return { dual: true, data: emptyMulti };
    }
    if (wantLegacyWeekToDateDual) {
      return { dual: true, data: { today: {}, weekToDate: {} } };
    }
    return { dual: false, data: {} };
  }

  const avgGoal = wantLaborCost ? average(perLoc.map((p) => p.laborCostGoal)) : 0;
  const avgTol = wantLaborCost ? average(perLoc.map((p) => p.laborCostGoalTolerance)) : 0;

  const prefetchInputs: AllLocationsPrefetchInput[] = perLoc.map((p) => {
    const uniqueRanges = fetchPeriods.map((period) => getRangeForPeriod(p.loc, period));
    return {
      locationMongoId: p.locationMongoId,
      ranges: uniqueRanges,
      timezone: p.loc.timezone ?? 'UTC',
      businessStartTime: p.loc.businessStartTime ?? '00:00',
    };
  });
  if (prefetchInputs.length > 0) {
    await prefetchAllLocationsDashboardData(prefetchInputs);
  }

  const kpisByPeriod: Partial<Record<Period, PeriodRangeKpis>> = {};
  for (const period of fetchPeriods) {
    const results = await Promise.all(
      perLoc.map(async (p) => {
        const { value, ms } = await timedPerLocation(() =>
          fetchKpisForRange(
            p.locationMongoId,
            p.loc,
            getRangeForPeriod(p.loc, period),
            wantNetSales,
            wantLaborCost,
            avgGoal,
            `${period} (all-locations)`,
          ),
        );
        perLocationMs.push(ms);
        return value;
      }),
    );

    const netSales = sumNullable(results.map((r) => r.netSales));
    const laborCost = sumNullable(results.map((r) => r.laborCost));
    const pct = laborPercent(netSales, laborCost);
    kpisByPeriod[period] = {
      netSales,
      laborCost,
      laborCostPercent: pct,
      laborCostStatus: laborStatus(pct, avgGoal),
    };
  }

  let reviewRatingData: ReviewRatingKpiData | undefined;
  if (wantReviewRating) {
    const summaries = await getReviewRatingSummariesForLocations(
      perLoc.map((p) => p.locationMongoId),
      perLoc.map((p) => p.loc),
    );
    reviewRatingData = summariesToReviewRatingData(summaries);
  }

  let data: unknown;
  if (wantLegacyWeekToDateDual) {
    const todayKpis = kpisByPeriod.today;
    const wtdKpis = kpisByPeriod.weekToDate;
    const pctToday = todayKpis?.laborCostPercent ?? null;
    const pctWtd = wtdKpis?.laborCostPercent ?? null;
    const { todayData, weekToDateData } = buildWeekToDateData(
      metrics,
      wantNetSales,
      wantLaborCost,
      wantReviewRating,
      {
        netSalesToday: todayKpis?.netSales ?? null,
        netSalesWeekToDate: wtdKpis?.netSales ?? null,
        laborCostToday: todayKpis?.laborCost ?? null,
        laborCostWeekToDate: wtdKpis?.laborCost ?? null,
        laborCostPercentToday: pctToday,
        laborCostStatusToday: laborStatus(pctToday, avgGoal),
        laborCostPercentWeekToDate: pctWtd,
        laborCostStatusWeekToDate: laborStatus(pctWtd, avgGoal),
      },
      avgGoal,
      avgTol,
      reviewRatingData,
    );
    data = { today: todayData, weekToDate: weekToDateData };
  } else if (wantsMultiPeriod) {
    data = buildMultiPeriodResponse(
      metrics,
      requestedPeriods,
      kpisByPeriod,
      wantReviewRating,
      avgGoal,
      avgTol,
      reviewRatingData,
    );
  } else {
    const onlyPeriod = requestedPeriods[0] ?? 'today';
    const periodKpis = kpisByPeriod[onlyPeriod];
    if (onlyPeriod === 'today' && periodKpis) {
      data = buildTodayOnlyData(
        metrics,
        wantNetSales,
        wantLaborCost,
        wantReviewRating,
        {
          netSalesToday: periodKpis.netSales,
          laborCostToday: periodKpis.laborCost,
          laborCostPercentToday: periodKpis.laborCostPercent,
          laborCostStatus: periodKpis.laborCostStatus,
        },
        avgGoal,
        avgTol,
        reviewRatingData,
      );
    } else {
      data = buildMultiPeriodResponse(
        metrics,
        [onlyPeriod],
        kpisByPeriod,
        wantReviewRating,
        avgGoal,
        avgTol,
        reviewRatingData,
      );
    }
  }

  summarizeAllLocationsTimings({
    route,
    locationCount: perLoc.length,
    totalMs: Math.round(performance.now() - tHandler),
    perLocationMs,
  });
  return { dual: wantsMultiPeriod || wantLegacyWeekToDateDual, data };
}

export async function buildAllLocationsHourlySales(params: {
  req: Request;
  locationService: LocationService;
}): Promise<HourlySalesRow[]> {
  const { req, locationService } = params;
  const effectiveIds = await resolveTargetLocationIds(req);
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


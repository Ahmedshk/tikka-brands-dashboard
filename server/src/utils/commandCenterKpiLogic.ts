import type { TimeRange } from "./businessHours.util.js";
import type { GoalService } from "../services/goal.service.js";
import {
  getNetSalesDollarsInRangeFromCache,
  getLaborCostInRangeFromCache,
} from "../services/integrationCacheRead.service.js";
import {
  getBusinessStartTimeRange,
  getLastWeekRange,
  getMonthToDateRange,
  getTodayInTimezone,
  getWeekToDateRange,
} from "./timezone.util.js";
import type {
  LocationForKpi,
  LaborGoals,
  LaborCostStatus,
  TodayOnlyKpis,
  WeekToDateKpis,
  FetchWeekToDateKpisParams,
  Period,
} from "../types/commandCenter.types.js";
import { getReviewRatingSummariesForLocation } from "./googleBusinessReviewAggregation.util.js";

export interface ReviewRatingKpiData {
  todayRating: number | null;
  todayCount: number | null;
  weekToDateRating: number | null;
  weekToDateCount: number | null;
  monthToDateRating: number | null;
  monthToDateCount: number | null;
  lastWeekRating: number | null;
  lastWeekCount: number | null;
  overallRating: number | null;
  overallCount: number | null;
}

export interface PeriodRangeKpis {
  netSales: number | null;
  laborCost: number | null;
  laborCostPercent: number | null;
  laborCostStatus: LaborCostStatus;
}

export async function fetchReviewRatingKpiData(
  locationMongoId: string,
  location: LocationForKpi,
): Promise<ReviewRatingKpiData> {
  const summaries = await getReviewRatingSummariesForLocation(location, locationMongoId);
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

const LOG_PREFIX = "[Command Center]";

export type {
  LocationForKpi,
  LaborGoals,
  LaborCostStatus,
  TodayOnlyKpis,
  WeekToDateKpis,
  FetchWeekToDateKpisParams,
} from "../types/commandCenter.types.js";

export async function getLaborCostGoals(
  goalService: GoalService,
  locationId: string,
  location: LocationForKpi,
  wantLaborCost: boolean,
): Promise<LaborGoals> {
  if (!wantLaborCost) {
    return { laborCostGoal: 0, laborCostGoalTolerance: 0 };
  }
  const todayInTz = getTodayInTimezone(location.timezone);
  const result = await goalService.getByLocationIdAndDate(locationId, todayInTz);
  return {
    laborCostGoal: result.goals.laborCostGoal ?? 0,
    laborCostGoalTolerance: result.goals.laborCostGoalTolerance ?? 0,
  };
}

export function getRangeToday(location: LocationForKpi): TimeRange {
  return getBusinessStartTimeRange(
    location.timezone,
    location.businessStartTime ?? "00:00",
  );
}

export function getRangeWeekToDate(location: LocationForKpi): TimeRange {
  return getWeekToDateRange(
    location.timezone,
    location.businessStartTime ?? "00:00",
  );
}

export function getRangeMonthToDate(location: LocationForKpi): TimeRange {
  return getMonthToDateRange(
    location.timezone,
    location.businessStartTime ?? "00:00",
  );
}

export function getRangeLastWeek(location: LocationForKpi): TimeRange {
  return getLastWeekRange(location.timezone);
}

export function getRangeForPeriod(location: LocationForKpi, period: Period): TimeRange {
  switch (period) {
    case "today":
      return getRangeToday(location);
    case "weekToDate":
      return getRangeWeekToDate(location);
    case "monthToDate":
      return getRangeMonthToDate(location);
    case "lastWeek":
      return getRangeLastWeek(location);
    default: {
      const _exhaustive: never = period;
      return _exhaustive;
    }
  }
}

function periodMetricSuffix(period: Period): string {
  switch (period) {
    case "today":
      return "Today";
    case "weekToDate":
      return "WeekToDate";
    case "monthToDate":
      return "MonthToDate";
    case "lastWeek":
      return "LastWeek";
    default: {
      const _exhaustive: never = period;
      return _exhaustive;
    }
  }
}

function laborStatusFieldKey(period: Period): string {
  if (period === "today") return "laborCostStatus";
  return `laborCostStatus${periodMetricSuffix(period)}`;
}

function reviewRatingForPeriod(
  reviewRating: ReviewRatingKpiData,
  period: Period,
): { rating: number | null; count: number | null } {
  switch (period) {
    case "today":
      return { rating: reviewRating.todayRating, count: reviewRating.todayCount };
    case "weekToDate":
      return {
        rating: reviewRating.weekToDateRating,
        count: reviewRating.weekToDateCount,
      };
    case "monthToDate":
      return {
        rating: reviewRating.monthToDateRating,
        count: reviewRating.monthToDateCount,
      };
    case "lastWeek":
      return {
        rating: reviewRating.lastWeekRating,
        count: reviewRating.lastWeekCount,
      };
    default: {
      const _exhaustive: never = period;
      return _exhaustive;
    }
  }
}

function wrapNetSalesErr(label: string): (err: unknown) => null {
  return (err: unknown) => {
    console.error(`${LOG_PREFIX} Square net sales (${label}) error:`, err);
    return null;
  };
}

function wrapLaborCostErr(label: string): (err: unknown) => null {
  return (err: unknown) => {
    console.error(`${LOG_PREFIX} Homebase labor cost (${label}) error:`, err);
    return null;
  };
}

export async function fetchTodayOnlyKpis(
  locationMongoId: string | undefined,
  location: LocationForKpi,
  rangeToday: TimeRange,
  wantNetSales: boolean,
  wantLaborCost: boolean,
  laborCostGoal: number,
): Promise<TodayOnlyKpis> {
  let netSalesToday: number | null = null;
  if (wantNetSales && location.squareLocationId?.trim() && locationMongoId) {
    try {
      netSalesToday = await getNetSalesDollarsInRangeFromCache(
        locationMongoId,
        rangeToday,
        {
          timezone: location.timezone,
          businessStartTime: location.businessStartTime ?? "00:00",
        },
        "GET /command-center/kpis netSales (today range)",
      );
    } catch (err) {
      console.error(`${LOG_PREFIX} Square net sales error:`, err);
    }
  }

  let laborCostToday: number | null = null;
  if (
    wantLaborCost &&
    location.homebaseLocationId?.trim() &&
    locationMongoId
  ) {
    try {
      laborCostToday = await getLaborCostInRangeFromCache(
        locationMongoId,
        rangeToday,
        {
          timezone: location.timezone,
          businessStartTime: location.businessStartTime ?? "00:00",
        },
        "GET /command-center/kpis laborCost (today range)",
      );
    } catch (err) {
      console.error(`${LOG_PREFIX} Homebase labor cost error:`, err);
    }
  }

  const { percent: laborCostPercentToday, status: laborCostStatus } =
    computeLaborPercentAndStatus(netSalesToday, laborCostToday, laborCostGoal);

  return {
    netSalesToday,
    laborCostToday,
    laborCostPercentToday,
    laborCostStatus,
  };
}

export async function fetchKpisForRange(
  locationMongoId: string | undefined,
  location: LocationForKpi,
  range: TimeRange,
  wantNetSales: boolean,
  wantLaborCost: boolean,
  laborCostGoal: number,
  logLabel: string,
): Promise<PeriodRangeKpis> {
  let netSales: number | null = null;
  if (wantNetSales && location.squareLocationId?.trim() && locationMongoId) {
    try {
      netSales = await getNetSalesDollarsInRangeFromCache(
        locationMongoId,
        range,
        {
          timezone: location.timezone,
          businessStartTime: location.businessStartTime ?? "00:00",
        },
        `GET /command-center/kpis netSales (${logLabel})`,
      );
    } catch (err) {
      console.error(`${LOG_PREFIX} Square net sales (${logLabel}) error:`, err);
    }
  }

  let laborCost: number | null = null;
  if (
    wantLaborCost &&
    location.homebaseLocationId?.trim() &&
    locationMongoId
  ) {
    try {
      laborCost = await getLaborCostInRangeFromCache(
        locationMongoId,
        range,
        {
          timezone: location.timezone,
          businessStartTime: location.businessStartTime ?? "00:00",
        },
        `GET /command-center/kpis laborCost (${logLabel})`,
      );
    } catch (err) {
      console.error(`${LOG_PREFIX} Homebase labor cost (${logLabel}) error:`, err);
    }
  }

  const { percent: laborCostPercent, status: laborCostStatus } =
    computeLaborPercentAndStatus(netSales, laborCost, laborCostGoal);

  return { netSales, laborCost, laborCostPercent, laborCostStatus };
}

export async function fetchKpisForPeriods(params: {
  locationMongoId?: string;
  location: LocationForKpi;
  periods: Period[];
  wantNetSales: boolean;
  wantLaborCost: boolean;
  laborCostGoal: number;
}): Promise<Partial<Record<Period, PeriodRangeKpis>>> {
  const {
    locationMongoId,
    location,
    periods,
    wantNetSales,
    wantLaborCost,
    laborCostGoal,
  } = params;
  const uniquePeriods = [...new Set(periods)];
  const entries = await Promise.all(
    uniquePeriods.map(async (period) => {
      const range = getRangeForPeriod(location, period);
      const kpis = await fetchKpisForRange(
        locationMongoId,
        location,
        range,
        wantNetSales,
        wantLaborCost,
        laborCostGoal,
        period,
      );
      return [period, kpis] as const;
    }),
  );
  return Object.fromEntries(entries) as Partial<Record<Period, PeriodRangeKpis>>;
}

export function buildSliceForPeriod(
  period: Period,
  metrics: string[] | undefined,
  wantReviewRating: boolean,
  kpis: PeriodRangeKpis,
  laborCostGoal: number,
  laborCostGoalTolerance: number,
  reviewRating?: ReviewRatingKpiData,
): Record<string, unknown> {
  const suffix = periodMetricSuffix(period);
  const data: Record<string, unknown> = {};
  if (!metrics?.length || metrics.includes("netSales")) {
    data[`netSales${suffix}`] = kpis.netSales;
  }
  if (!metrics?.length || metrics.includes("laborCost")) {
    data[`laborCost${suffix}`] = kpis.laborCost;
    data[`laborCostPercent${suffix}`] = kpis.laborCostPercent;
    data.laborCostGoal = laborCostGoal;
    data.laborCostGoalTolerance = laborCostGoalTolerance;
    data[laborStatusFieldKey(period)] = kpis.laborCostStatus;
  }
  if (wantReviewRating && reviewRating) {
    const { rating, count } = reviewRatingForPeriod(reviewRating, period);
    data.reviewRating = rating;
    data.reviewCount = count;
    data.reviewRatingOverall = reviewRating.overallRating;
    data.reviewCountOverall = reviewRating.overallCount;
  }
  return data;
}

export function buildMultiPeriodResponse(
  metrics: string[] | undefined,
  periods: Period[],
  kpisByPeriod: Partial<Record<Period, PeriodRangeKpis>>,
  wantReviewRating: boolean,
  laborCostGoal: number,
  laborCostGoalTolerance: number,
  reviewRating?: ReviewRatingKpiData,
): Record<string, unknown> {
  const uniquePeriods = [...new Set(periods)];
  if (uniquePeriods.length === 1 && uniquePeriods[0] === "today") {
    const todayKpis = kpisByPeriod.today;
    if (todayKpis) {
      return buildTodayOnlyData(
        metrics,
        false,
        false,
        wantReviewRating,
        {
          netSalesToday: todayKpis.netSales,
          laborCostToday: todayKpis.laborCost,
          laborCostPercentToday: todayKpis.laborCostPercent,
          laborCostStatus: todayKpis.laborCostStatus,
        },
        laborCostGoal,
        laborCostGoalTolerance,
        reviewRating,
      );
    }
  }

  const result: Record<string, unknown> = {};
  for (const period of uniquePeriods) {
    const kpis = kpisByPeriod[period];
    if (kpis == null) continue;
    result[period] = buildSliceForPeriod(
      period,
      metrics,
      wantReviewRating,
      kpis,
      laborCostGoal,
      laborCostGoalTolerance,
      reviewRating,
    );
  }
  return result;
}

export function computeLaborPercentAndStatus(
  netSales: number | null,
  laborCost: number | null,
  laborCostGoal: number,
): { percent: number | null; status: LaborCostStatus } {
  if (
    netSales == null ||
    laborCost == null ||
    netSales <= 0
  ) {
    return { percent: null, status: null };
  }
  const percent = (laborCost / netSales) * 100;
  const status = percent < laborCostGoal ? "green" : "red";
  return { percent, status };
}

export async function fetchWeekToDateKpis(
  params: FetchWeekToDateKpisParams,
): Promise<WeekToDateKpis> {
  const {
    locationMongoId,
    location,
    rangeToday,
    rangeWeekToDate,
    wantNetSales,
    wantLaborCost,
    laborCostGoal,
  } = params;
  const netSalesPromises: Promise<number | null>[] = [];
  const laborCostPromises: Promise<number | null>[] = [];

  if (wantNetSales && location.squareLocationId?.trim()) {
    if (locationMongoId) {
      const rollupCtx = {
        timezone: location.timezone,
        businessStartTime: location.businessStartTime ?? "00:00",
      };
      netSalesPromises.push(
        getNetSalesDollarsInRangeFromCache(
          locationMongoId,
          rangeToday,
          rollupCtx,
          "GET /command-center/kpis netSales (today range, dual-period)",
        ).catch(wrapNetSalesErr("today")),
        getNetSalesDollarsInRangeFromCache(
          locationMongoId,
          rangeWeekToDate,
          rollupCtx,
          "GET /command-center/kpis netSales (week-to-date range)",
        ).catch(wrapNetSalesErr("WTD")),
      );
    } else {
      netSalesPromises.push(Promise.resolve(null), Promise.resolve(null));
    }
  } else {
    netSalesPromises.push(Promise.resolve(null), Promise.resolve(null));
  }

  if (wantLaborCost && location.homebaseLocationId?.trim()) {
    if (locationMongoId) {
      const laborRollupCtx = {
        timezone: location.timezone,
        businessStartTime: location.businessStartTime ?? "00:00",
      };
      laborCostPromises.push(
        getLaborCostInRangeFromCache(
          locationMongoId,
          rangeToday,
          laborRollupCtx,
          "GET /command-center/kpis laborCost (today range, dual-period)",
        ).catch(wrapLaborCostErr("today")),
        getLaborCostInRangeFromCache(
          locationMongoId,
          rangeWeekToDate,
          laborRollupCtx,
          "GET /command-center/kpis laborCost (week-to-date range)",
        ).catch(wrapLaborCostErr("WTD")),
      );
    } else {
      laborCostPromises.push(Promise.resolve(null), Promise.resolve(null));
    }
  } else {
    laborCostPromises.push(Promise.resolve(null), Promise.resolve(null));
  }

  const netSalesResults =
    netSalesPromises.length >= 2
      ? await Promise.all(netSalesPromises)
      : [null, null];
  const laborCostResults =
    laborCostPromises.length >= 2
      ? await Promise.all(laborCostPromises)
      : [null, null];

  const netSalesToday = netSalesResults[0] ?? null;
  const netSalesWeekToDate = netSalesResults[1] ?? null;
  const laborCostToday = laborCostResults[0] ?? null;
  const laborCostWeekToDate = laborCostResults[1] ?? null;

  const todayStatus = computeLaborPercentAndStatus(
    netSalesToday,
    laborCostToday,
    laborCostGoal,
  );
  const wtdStatus = computeLaborPercentAndStatus(
    netSalesWeekToDate,
    laborCostWeekToDate,
    laborCostGoal,
  );

  return {
    netSalesToday,
    netSalesWeekToDate,
    laborCostToday,
    laborCostWeekToDate,
    laborCostPercentToday: todayStatus.percent,
    laborCostStatusToday: todayStatus.status,
    laborCostPercentWeekToDate: wtdStatus.percent,
    laborCostStatusWeekToDate: wtdStatus.status,
  };
}

export function buildTodayOnlyData(
  metrics: string[] | undefined,
  _wantNetSales: boolean,
  _wantLaborCost: boolean,
  wantReviewRating: boolean,
  kpis: TodayOnlyKpis,
  laborCostGoal: number,
  laborCostGoalTolerance: number,
  reviewRating?: ReviewRatingKpiData,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (!metrics?.length || metrics.includes("netSales")) {
    data.netSalesToday = kpis.netSalesToday;
  }
  if (!metrics?.length || metrics.includes("laborCost")) {
    data.laborCostToday = kpis.laborCostToday;
    data.laborCostPercentToday = kpis.laborCostPercentToday;
    data.laborCostGoal = laborCostGoal;
    data.laborCostGoalTolerance = laborCostGoalTolerance;
    data.laborCostStatus = kpis.laborCostStatus;
  }
  if (wantReviewRating && reviewRating) {
    data.reviewRating = reviewRating.todayRating;
    data.reviewCount = reviewRating.todayCount;
    data.reviewRatingOverall = reviewRating.overallRating;
    data.reviewCountOverall = reviewRating.overallCount;
  }
  return data;
}

export function buildWeekToDateData(
  metrics: string[] | undefined,
  _wantNetSales: boolean,
  _wantLaborCost: boolean,
  wantReviewRating: boolean,
  kpis: WeekToDateKpis,
  laborCostGoal: number,
  laborCostGoalTolerance: number,
  reviewRating?: ReviewRatingKpiData,
): { todayData: Record<string, unknown>; weekToDateData: Record<string, unknown> } {
  const todayData: Record<string, unknown> = {};
  const weekToDateData: Record<string, unknown> = {};

  if (!metrics?.length || metrics.includes("netSales")) {
    todayData.netSalesToday = kpis.netSalesToday;
    weekToDateData.netSalesWeekToDate = kpis.netSalesWeekToDate;
  }
  if (!metrics?.length || metrics.includes("laborCost")) {
    todayData.laborCostToday = kpis.laborCostToday;
    todayData.laborCostPercentToday = kpis.laborCostPercentToday;
    todayData.laborCostGoal = laborCostGoal;
    todayData.laborCostGoalTolerance = laborCostGoalTolerance;
    todayData.laborCostStatus = kpis.laborCostStatusToday;
    weekToDateData.laborCostWeekToDate = kpis.laborCostWeekToDate;
    weekToDateData.laborCostPercentWeekToDate = kpis.laborCostPercentWeekToDate;
    weekToDateData.laborCostGoal = laborCostGoal;
    weekToDateData.laborCostGoalTolerance = laborCostGoalTolerance;
    weekToDateData.laborCostStatusWeekToDate = kpis.laborCostStatusWeekToDate;
  }
  if (wantReviewRating && reviewRating) {
    todayData.reviewRating = reviewRating.todayRating;
    todayData.reviewCount = reviewRating.todayCount;
    todayData.reviewRatingOverall = reviewRating.overallRating;
    todayData.reviewCountOverall = reviewRating.overallCount;
    weekToDateData.reviewRating = reviewRating.weekToDateRating;
    weekToDateData.reviewCount = reviewRating.weekToDateCount;
    weekToDateData.reviewRatingOverall = reviewRating.overallRating;
    weekToDateData.reviewCountOverall = reviewRating.overallCount;
  }

  return { todayData, weekToDateData };
}

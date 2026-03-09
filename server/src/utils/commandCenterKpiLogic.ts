import type { TimeRange } from "./businessHours.util.js";
import { getLaborCostInRange } from "../services/homebase.service.js";
import type { GoalService } from "../services/goal.service.js";
import { getNetSalesInRange } from "../services/square.service.js";
import {
  getBusinessStartTimeRange,
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
} from "../types/commandCenter.types.js";

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
  location: LocationForKpi,
  squareAccessToken: string | null,
  homebaseApiKey: string | null,
  rangeToday: TimeRange,
  wantNetSales: boolean,
  wantLaborCost: boolean,
  laborCostGoal: number,
): Promise<TodayOnlyKpis> {
  let netSalesToday: number | null = null;
  if (wantNetSales && location.squareLocationId?.trim()) {
    try {
      netSalesToday = await getNetSalesInRange(
        location.squareLocationId,
        rangeToday,
        { accessToken: squareAccessToken ?? undefined },
      );
    } catch (err) {
      console.error(`${LOG_PREFIX} Square net sales error:`, err);
    }
  }

  let laborCostToday: number | null = null;
  if (wantLaborCost && location.homebaseLocationId?.trim()) {
    try {
      laborCostToday = await getLaborCostInRange(
        location.homebaseLocationId,
        rangeToday,
        { apiKey: homebaseApiKey ?? undefined },
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
    location,
    squareAccessToken,
    homebaseApiKey,
    rangeToday,
    rangeWeekToDate,
    wantNetSales,
    wantLaborCost,
    laborCostGoal,
  } = params;
  const netSalesPromises: Promise<number | null>[] = [];
  const laborCostPromises: Promise<number | null>[] = [];

  if (wantNetSales && location.squareLocationId?.trim()) {
    netSalesPromises.push(
      getNetSalesInRange(location.squareLocationId, rangeToday, {
        accessToken: squareAccessToken ?? undefined,
      }).catch(wrapNetSalesErr("today")),
      getNetSalesInRange(location.squareLocationId, rangeWeekToDate, {
        accessToken: squareAccessToken ?? undefined,
      }).catch(wrapNetSalesErr("WTD")),
    );
  } else {
    netSalesPromises.push(Promise.resolve(null), Promise.resolve(null));
  }

  if (wantLaborCost && location.homebaseLocationId?.trim()) {
    laborCostPromises.push(
      getLaborCostInRange(location.homebaseLocationId, rangeToday, {
        apiKey: homebaseApiKey ?? undefined,
      }).catch(wrapLaborCostErr("today")),
      getLaborCostInRange(location.homebaseLocationId, rangeWeekToDate, {
        apiKey: homebaseApiKey ?? undefined,
      }).catch(wrapLaborCostErr("WTD")),
    );
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
  if (wantReviewRating) {
    data.reviewRating = 4.3;
    data.reviewCount = 272;
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
  if (wantReviewRating) {
    todayData.reviewRating = 4.3;
    todayData.reviewCount = 272;
    weekToDateData.reviewRating = 4.3;
    weekToDateData.reviewCount = 272;
  }

  return { todayData, weekToDateData };
}

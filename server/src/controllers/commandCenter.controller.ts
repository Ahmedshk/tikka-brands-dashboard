import { Request, Response, NextFunction } from "express";
import { GoalService } from "../services/goal.service.js";
import { LocationService } from "../services/location.service.js";
import { searchOrdersInRange } from "../services/square.service.js";
import { NotFoundError } from "../utils/errors.util.js";
import {
  parseMetricsQuery,
  PAGE_COMPONENT_IDS,
  filterAllowedMetrics,
  getAllMetricIdsForPage,
} from "../config/kpi-metrics.config.js";
import { getEffectivePagePermission } from "../utils/permissions.util.js";
import {
  parsePeriodsQuery,
  validateCommandCenterMetrics,
  getWantFlags,
  buildEmptyHourlySalesRows,
} from "../utils/commandCenterHelpers.js";
import type { HourlySalesRow, LocationForKpi } from "../types/commandCenter.types.js";
import {
  getLaborCostGoals,
  getRangeToday,
  getRangeWeekToDate,
  fetchTodayOnlyKpis,
  fetchWeekToDateKpis,
  buildTodayOnlyData,
  buildWeekToDateData,
} from "../utils/commandCenterKpiLogic.js";
import { getTodayRangeFullDay, getSameDayLastWeekRange, getHourInTimezone } from "../utils/timezone.util.js";

const goalService = new GoalService();
const locationService = new LocationService();

function toLocationForKpi(location: {
  timezone?: string;
  businessStartTime?: string | null;
  squareLocationId?: string | null;
  homebaseLocationId?: string | null;
}): LocationForKpi {
  return {
    timezone: location.timezone ?? "",
    businessStartTime: location.businessStartTime ?? null,
    squareLocationId: location.squareLocationId?.trim() ?? null,
    homebaseLocationId: location.homebaseLocationId?.trim() ?? null,
  };
}

export const getCommandCenterKPIs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId : "";
    const queryMetrics = parseMetricsQuery(req.query.metrics);
    const periods = parsePeriodsQuery(req.query.periods);

    const effectivePage = getEffectivePagePermission(
      req.user!.permissions!,
      req.user!.permissionRemovals ?? null,
      "command-center",
      PAGE_COMPONENT_IDS["command-center"] ?? [],
      "Command Center",
      req.user!.permissionOverrides ?? null
    );
    const effectivePermissions =
      effectivePage != null
        ? { type: "custom" as const, pages: [effectivePage] }
        : undefined;
    if (!validateCommandCenterMetrics(res, effectivePermissions, queryMetrics)) {
      return;
    }

    const allMetricIds = getAllMetricIdsForPage("command-center");
    const allowedMetrics = effectivePermissions
      ? filterAllowedMetrics(effectivePermissions, "command-center", allMetricIds)
      : [];
    const metrics =
      queryMetrics?.length ?
        queryMetrics.filter((m) => allowedMetrics.includes(m))
        : allowedMetrics;

    if (metrics.length === 0) {
      const emptyToday: Record<string, unknown> = {};
      const emptyWeekToDate: Record<string, unknown> = {};
      if (Array.isArray(periods) && periods.includes("weekToDate")) {
        res.status(200).json({
          success: true,
          data: { today: emptyToday, weekToDate: emptyWeekToDate },
        });
      } else {
        res.status(200).json({ success: true, data: emptyToday });
      }
      return;
    }

    const withCreds = await locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, squareAccessToken, homebaseApiKey } = withCreds;
    const loc = toLocationForKpi(location);

    const { wantNetSales, wantLaborCost, wantReviewRating } =
      getWantFlags(metrics);
    const { laborCostGoal, laborCostGoalTolerance } = await getLaborCostGoals(
      goalService,
      locationId,
      loc,
      wantLaborCost,
    );
    const rangeToday = getRangeToday(loc);
    const wantWeekToDate =
      Array.isArray(periods) && periods.includes("weekToDate");

    if (wantWeekToDate) {
      const rangeWeekToDate = getRangeWeekToDate(loc);
      const kpis = await fetchWeekToDateKpis({
        location: loc,
        squareAccessToken,
        homebaseApiKey,
        rangeToday,
        rangeWeekToDate,
        wantNetSales,
        wantLaborCost,
        laborCostGoal,
      });
      const { todayData, weekToDateData } = buildWeekToDateData(
        metrics,
        wantNetSales,
        wantLaborCost,
        wantReviewRating,
        kpis,
        laborCostGoal,
        laborCostGoalTolerance,
      );
      res.status(200).json({
        success: true,
        data: { today: todayData, weekToDate: weekToDateData },
      });
      return;
    }

    const kpis = await fetchTodayOnlyKpis(
      loc,
      squareAccessToken,
      homebaseApiKey,
      rangeToday,
      wantNetSales,
      wantLaborCost,
      laborCostGoal,
    );
    const data = buildTodayOnlyData(
      metrics,
      wantNetSales,
      wantLaborCost,
      wantReviewRating,
      kpis,
      laborCostGoal,
      laborCostGoalTolerance,
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export type { HourlySalesRow } from "../types/commandCenter.types.js";

const HOURLY_SALES_COMPONENT_ID = "hourly-net-sales-chart";

export const getHourlySales = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const effectivePage = getEffectivePagePermission(
      req.user!.permissions!,
      req.user!.permissionRemovals ?? null,
      "command-center",
      PAGE_COMPONENT_IDS["command-center"] ?? [],
      "Command Center",
      req.user!.permissionOverrides ?? null
    );
    const canAccessHourly =
      effectivePage?.components?.includes("full-page") === true ||
      effectivePage?.components?.includes(HOURLY_SALES_COMPONENT_ID) === true;
    if (!canAccessHourly) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }

    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId : "";
    const withCreds = await locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, squareAccessToken } = withCreds;
    const timezone = location.timezone?.trim();
    const squareLocationId = location.squareLocationId?.trim();
    if (!timezone || !squareLocationId) {
      res.status(200).json({
        success: true,
        data: buildEmptyHourlySalesRows(),
      });
      return;
    }

    const squareOptions = { accessToken: squareAccessToken ?? undefined };
    const todayRange = getTodayRangeFullDay(timezone);
    const lastWeekRange = getSameDayLastWeekRange(timezone);

    const [todayOrders, lastWeekOrders] = await Promise.all([
      searchOrdersInRange(squareLocationId, todayRange, squareOptions),
      searchOrdersInRange(squareLocationId, lastWeekRange, squareOptions),
    ]);

    const todayBuckets = new Array<number>(24).fill(0);
    const lastWeekBuckets = new Array<number>(24).fill(0);

    for (const order of todayOrders) {
      const hour = getHourInTimezone(order.created_at, timezone);
      if (hour >= 0 && hour < 24) {
        todayBuckets[hour] = (todayBuckets[hour] ?? 0) + order.amountCents;
      }
    }
    for (const order of lastWeekOrders) {
      const hour = getHourInTimezone(order.created_at, timezone);
      if (hour >= 0 && hour < 24) {
        lastWeekBuckets[hour] =
          (lastWeekBuckets[hour] ?? 0) + order.amountCents;
      }
    }

    const rows: HourlySalesRow[] = [];
    for (let h = 0; h < 24; h++) {
      const todayCents = todayBuckets[h] ?? 0;
      const lastWeekCents = lastWeekBuckets[h] ?? 0;
      rows.push({
        hour: `${String(h).padStart(2, "0")}:00`,
        today: todayCents / 100,
        last_week: lastWeekCents / 100,
      });
    }

    res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    next(error);
  }
};

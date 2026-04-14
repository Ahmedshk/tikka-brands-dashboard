import { Request, Response, NextFunction } from "express";
import { GoalService } from "../services/goal.service.js";
import { LocationService } from "../services/location.service.js";
import { fetchHourlyNetSalesCentsBySlotFromCache } from "../services/integrationCacheRead.service.js";
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
  addCalendarDaysToBusinessDateKey,
  businessDateKeyForInstant,
  businessDayUtcRangeIsoStrings,
} from "../utils/businessDayUtcRange.util.js";
import { isAllLocationsId } from "../utils/locationScope.js";
import {
  buildAllLocationsCommandCenterKpis,
  buildAllLocationsHourlySales,
} from "../utils/commandCenterAllLocations.util.js";
import {
  buildTodayOnlyData,
  buildWeekToDateData,
  fetchTodayOnlyKpis,
  fetchWeekToDateKpis,
  getLaborCostGoals,
  getRangeToday,
  getRangeWeekToDate,
} from "../utils/commandCenterKpiLogic.js";
import { getBusinessStartTimeRange } from "../utils/timezone.util.js";

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
    const effectivePermissions = effectivePage
      ? { type: "custom" as const, pages: [effectivePage] }
      : undefined;
    const metricsAllowed = validateCommandCenterMetrics(
      res,
      effectivePermissions,
      queryMetrics,
    );
    if (metricsAllowed === false) return;

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

    if (isAllLocationsId(locationId)) {
      const { wantNetSales, wantLaborCost, wantReviewRating } = getWantFlags(metrics);
      const result = await buildAllLocationsCommandCenterKpis({
        req,
        metrics,
        periods,
        wantNetSales,
        wantLaborCost,
        wantReviewRating,
        goalService,
        locationService,
        toLocationForKpi,
      });
      res.status(200).json({ success: true, data: result.data });
      return;
    }

    const withCreds = await locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location } = withCreds;
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
        locationMongoId: locationId,
        location: loc,
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
      locationId,
      loc,
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
    if (isAllLocationsId(locationId)) {
      const rows = await buildAllLocationsHourlySales({ req, locationService });
      res.status(200).json({ success: true, data: rows });
      return;
    }
    const withCreds = await locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location } = withCreds;
    const timezone = location.timezone?.trim();
    const squareLocationId = location.squareLocationId?.trim();
    if (!timezone || !squareLocationId) {
      res.status(200).json({
        success: true,
        data: buildEmptyHourlySalesRows(),
      });
      return;
    }

    const businessStartTime = location.businessStartTime?.trim() ?? "00:00";
    const todayRange = getBusinessStartTimeRange(timezone, businessStartTime);
    const todayKey = businessDateKeyForInstant(
      new Date(),
      timezone,
      businessStartTime,
    );
    const lastWeekKey = addCalendarDaysToBusinessDateKey(todayKey, -7);
    const lastWeekRange = businessDayUtcRangeIsoStrings(
      timezone,
      businessStartTime,
      lastWeekKey,
    );

    const [todaySlots, lastWeekSlots] = await Promise.all([
      fetchHourlyNetSalesCentsBySlotFromCache(
        locationId,
        todayRange,
        timezone,
        businessStartTime,
        "GET /command-center/hourly-sales today (current business day)",
      ),
      fetchHourlyNetSalesCentsBySlotFromCache(
        locationId,
        lastWeekRange,
        timezone,
        businessStartTime,
        "GET /command-center/hourly-sales last week (business date − 7 days)",
      ),
    ]);

    const startHour = Number.parseInt(
      businessStartTime.split(":")[0] ?? "0",
      10,
    );
    const rows: HourlySalesRow[] = [];
    for (let slot = 0; slot < 24; slot++) {
      const hour24 = (startHour + slot) % 24;
      rows.push({
        hour: `${String(hour24).padStart(2, "0")}:00`,
        today: (todaySlots[slot] ?? 0) / 100,
        last_week: (lastWeekSlots[slot] ?? 0) / 100,
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

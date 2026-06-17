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
import { resolveTargetLocationIds } from "../utils/locationScope.js";
import {
  buildAllLocationsCommandCenterKpis,
  buildAllLocationsHourlySales,
} from "../utils/commandCenterAllLocations.util.js";
import {
  buildMultiPeriodResponse,
  buildTodayOnlyData,
  buildWeekToDateData,
  fetchKpisForPeriods,
  fetchReviewRatingKpiData,
  fetchTodayOnlyKpis,
  fetchWeekToDateKpis,
  getLaborCostGoals,
  getRangeToday,
  getRangeWeekToDate,
} from "../utils/commandCenterKpiLogic.js";
import type { Period } from "../types/commandCenter.types.js";
import { getBusinessStartTimeRange } from "../utils/timezone.util.js";
import { serveDashboardWithCache } from "../services/dashboardCache.service.js";

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
    const sortedMetrics = [...metrics].sort();
    const sortedPeriods = Array.isArray(periods) ? [...periods].sort() : null;

    await serveDashboardWithCache({
      req,
      res,
      endpoint: "command-center.kpis",
      params: { metrics: sortedMetrics, periods: sortedPeriods },
      compute: async () => {
        if (sortedMetrics.length === 0) {
          const requestedPeriods: Period[] =
            Array.isArray(periods) && periods.length > 0 ? periods : ["today"];
          if (requestedPeriods.length > 1) {
            const emptyMulti: Record<string, unknown> = {};
            for (const period of requestedPeriods) {
              emptyMulti[period] = {};
            }
            return emptyMulti;
          }
          if (requestedPeriods[0] === "weekToDate") {
            return { today: {}, weekToDate: {} };
          }
          return {};
        }

        const targetIds = await resolveTargetLocationIds(req);
        if (targetIds.length > 1) {
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
          return result.data;
        }

        const singleLocationId = targetIds[0]!;
        const withCreds = await locationService.getByIdWithCredentials(singleLocationId);
        if (!withCreds) {
          throw new NotFoundError("Location not found");
        }
        const { location } = withCreds;
        const loc = toLocationForKpi(location);

        const { wantNetSales, wantLaborCost, wantReviewRating } =
          getWantFlags(metrics);
        const { laborCostGoal, laborCostGoalTolerance } = await getLaborCostGoals(
          goalService,
          singleLocationId,
          loc,
          wantLaborCost,
        );
        const rangeToday = getRangeToday(loc);
        const requestedPeriods: Period[] =
          Array.isArray(periods) && periods.length > 0 ? periods : ["today"];
        const wantsMultiPeriod = requestedPeriods.length > 1;

        const reviewRating = wantReviewRating
          ? await fetchReviewRatingKpiData(singleLocationId, loc)
          : undefined;

        if (wantsMultiPeriod) {
          const kpisByPeriod = await fetchKpisForPeriods({
            locationMongoId: singleLocationId,
            location: loc,
            periods: requestedPeriods,
            wantNetSales,
            wantLaborCost,
            laborCostGoal,
          });
          return buildMultiPeriodResponse(
            metrics,
            requestedPeriods,
            kpisByPeriod,
            wantReviewRating,
            laborCostGoal,
            laborCostGoalTolerance,
            reviewRating,
          );
        }

        const onlyPeriod = requestedPeriods[0] ?? "today";
        if (onlyPeriod === "weekToDate") {
          const rangeWeekToDate = getRangeWeekToDate(loc);
          const kpis = await fetchWeekToDateKpis({
            locationMongoId: singleLocationId,
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
            reviewRating,
          );
          return { today: todayData, weekToDate: weekToDateData };
        }

        if (onlyPeriod !== "today") {
          const kpisByPeriod = await fetchKpisForPeriods({
            locationMongoId: singleLocationId,
            location: loc,
            periods: [onlyPeriod],
            wantNetSales,
            wantLaborCost,
            laborCostGoal,
          });
          return buildMultiPeriodResponse(
            metrics,
            [onlyPeriod],
            kpisByPeriod,
            wantReviewRating,
            laborCostGoal,
            laborCostGoalTolerance,
            reviewRating,
          );
        }

        const kpis = await fetchTodayOnlyKpis(
          singleLocationId,
          loc,
          rangeToday,
          wantNetSales,
          wantLaborCost,
          laborCostGoal,
        );
        return buildTodayOnlyData(
          metrics,
          wantNetSales,
          wantLaborCost,
          wantReviewRating,
          kpis,
          laborCostGoal,
          laborCostGoalTolerance,
          reviewRating,
        );
      },
    });
  } catch (error) {
    next(error);
  }
};

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

    await serveDashboardWithCache({
      req,
      res,
      endpoint: "command-center.hourly-sales",
      params: {},
      compute: async () => {
        const targetIds = await resolveTargetLocationIds(req);
        if (targetIds.length > 1) {
          return await buildAllLocationsHourlySales({ req, locationService });
        }
        const singleLocationId = targetIds[0]!;
        const withCreds = await locationService.getByIdWithCredentials(singleLocationId);
        if (!withCreds) {
          throw new NotFoundError("Location not found");
        }
        const { location } = withCreds;
        const timezone = location.timezone?.trim();
        const squareLocationId = location.squareLocationId?.trim();
        if (!timezone || !squareLocationId) {
          return buildEmptyHourlySalesRows();
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
            singleLocationId,
            todayRange,
            timezone,
            businessStartTime,
            "GET /command-center/hourly-sales today (current business day)",
          ),
          fetchHourlyNetSalesCentsBySlotFromCache(
            singleLocationId,
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
        return rows;
      },
    });
  } catch (error) {
    next(error);
  }
};

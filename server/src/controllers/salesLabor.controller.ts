import { Request, Response, NextFunction } from "express";
import {
  loadHomebaseTimecardsForMongoRange,
} from "../services/integrationCacheRead.service.js";
import { LocationService } from "../services/location.service.js";
import {
  getStartOfDayUtc,
  getEndOfDayUtc,
  getDatePartsInTz,
} from "../utils/salesTrendDateRange.util.js";
import {
  parseSalesTrendQuery,
  parseSalesTrendKpiQuery,
  buildSalesTrendContext,
  getSalesTrendData,
  getSalesTrendKpiData,
  isLaborDateRangeError,
} from "../utils/salesTrendControllerHelpers.js";
import { NotFoundError } from "../utils/errors.util.js";
import {
  parseMetricsQuery,
  filterAllowedMetrics,
  getAllMetricIdsForPage,
  PAGE_COMPONENT_IDS,
} from "../config/kpi-metrics.config.js";
import { getEffectivePagePermission } from "../utils/permissions.util.js";
import {
  validateSalesLaborMetrics,
  buildEmptySalesLaborKPIs,
  getSalesLaborTimeRange,
  fetchSquareOrderStatsAndSources,
  fetchLaborCostAndHours,
  buildSalesLaborKpisFullData,
  buildSalesLaborKpisResponseData,
  buildHourlyBreakdownLabels,
  fetchHourlyNetSalesCentsBySlot,
  fetchHourlyLaborCostPerHour,
  computeLaborCostPercentPerHour,
  buildEmptyHourlyBreakdownData,
  parseSalesByCategoryQuery,
  SALES_LABOR_DETAIL_API_LOG,
  type LocationForSalesLabor,
} from "../utils/salesLaborControllerHelpers.js";
import { isAllLocationsId } from "../utils/locationScope.js";
import {
  buildAllLocationsHourlyBreakdown,
  buildAllLocationsSalesLaborKpis,
  buildAllLocationsTimesheetRows,
} from "../utils/salesLaborAllLocations.util.js";
import {
  buildAllLocationsSalesTrend,
  buildAllLocationsSalesTrendKpi,
} from "../utils/salesTrendAllLocations.util.js";
import { buildSalesByCategoryAllLocations } from "../utils/salesByCategoryAllLocations.util.js";
import { getSalesByCategoryDataForLocation } from "../utils/salesByCategoryControllerHelpers.util.js";
import { serveDashboardWithCache } from "../services/dashboardCache.service.js";

const locationService = new LocationService();

export const getSalesLaborKPIs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId : "";
    const queryMetrics = parseMetricsQuery(req.query.metrics);

    const effectivePage = getEffectivePagePermission(
      req.user!.permissions!,
      req.user!.permissionRemovals ?? null,
      "sales-labor-detail",
      PAGE_COMPONENT_IDS["sales-labor-detail"] ?? [],
      "Sales & Labor Detail",
      req.user!.permissionOverrides ?? null
    );
    const effectivePermissions =
      effectivePage ? { type: "custom" as const, pages: [effectivePage] } : undefined;
    const allMetricIds = getAllMetricIdsForPage("sales-labor-detail");
    const allowedMetrics = effectivePermissions
      ? filterAllowedMetrics(effectivePermissions, "sales-labor-detail", allMetricIds)
      : [];

    const ok = validateSalesLaborMetrics(res, effectivePermissions, queryMetrics);
    if (ok === false) return;

    const metrics =
      queryMetrics?.length
        ? queryMetrics.filter((m) => allowedMetrics.includes(m))
        : allowedMetrics;
    const sortedMetrics = [...metrics].sort();

    await serveDashboardWithCache({
      req,
      res,
      endpoint: "sales-labor.kpis",
      params: { metrics: sortedMetrics },
      compute: async () => {
        if (isAllLocationsId(locationId)) {
          if (sortedMetrics.length === 0) {
            return buildEmptySalesLaborKPIs();
          }
          return await buildAllLocationsSalesLaborKpis({
            req,
            metrics,
            locationService,
          });
        }

        const withCreds = await locationService.getByIdWithCredentials(locationId);
        if (!withCreds) {
          throw new NotFoundError("Location not found");
        }
        const { location, squareAccessToken, homebaseApiKey } = withCreds;
        const timezone = location.timezone?.trim();
        if (!timezone) {
          return buildEmptySalesLaborKPIs();
        }

        const loc: LocationForSalesLabor = {
          timezone: location.timezone,
          businessStartTime: location.businessStartTime,
          squareLocationId: location.squareLocationId,
          homebaseLocationId: location.homebaseLocationId,
        };
        const range = getSalesLaborTimeRange(loc);
        const squareLocationId = location.squareLocationId?.trim();
        const homebaseLocationId = location.homebaseLocationId?.trim();

        if (sortedMetrics.length === 0) {
          return buildEmptySalesLaborKPIs();
        }

        const [squareData, laborData] = await Promise.all([
          squareLocationId
            ? fetchSquareOrderStatsAndSources(
                squareLocationId,
                range,
                squareAccessToken ?? undefined,
                locationId,
                {
                  timezone,
                  businessStartTime: location.businessStartTime?.trim() ?? "00:00",
                },
              )
            : Promise.resolve(null),
          homebaseLocationId
            ? fetchLaborCostAndHours(
                homebaseLocationId,
                range,
                homebaseApiKey ?? undefined,
                locationId,
                {
                  timezone,
                  businessStartTime: location.businessStartTime?.trim() ?? "00:00",
                },
              )
            : Promise.resolve(null),
        ]);

        const fullData = buildSalesLaborKpisFullData(squareData, laborData);
        return buildSalesLaborKpisResponseData(metrics, fullData);
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getHourlyBreakdown = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId : "";
    await serveDashboardWithCache({
      req,
      res,
      endpoint: "sales-labor.hourly-breakdown",
      params: {},
      compute: async () => {
        if (isAllLocationsId(locationId)) {
          return await buildAllLocationsHourlyBreakdown({ req, locationService });
        }
        const withCreds = await locationService.getByIdWithCredentials(locationId);
        if (!withCreds) {
          throw new NotFoundError("Location not found");
        }
        const { location, squareAccessToken, homebaseApiKey } = withCreds;
        const timezone = location.timezone?.trim();
        const businessStartTime = location.businessStartTime?.trim() ?? "00:00";
        const labels = buildHourlyBreakdownLabels(businessStartTime);

        if (!timezone) {
          return buildEmptyHourlyBreakdownData(labels);
        }

        const loc: LocationForSalesLabor = {
          timezone: location.timezone,
          businessStartTime: location.businessStartTime,
          squareLocationId: location.squareLocationId,
          homebaseLocationId: location.homebaseLocationId,
        };
        const range = getSalesLaborTimeRange(loc);
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
                locationId,
              )
            : Promise.resolve(new Array<number>(24).fill(0)),
          homebaseLocationId
            ? fetchHourlyLaborCostPerHour(
                homebaseLocationId,
                range,
                timezone,
                businessStartTime,
                homebaseApiKey ?? undefined,
                locationId,
              )
            : Promise.resolve(new Array<number>(24).fill(0)),
        ]);

        const netSalesPerHour = netSalesCentsBySlot.map((cents) => cents / 100);
        const laborCostPercentPerHour = computeLaborCostPercentPerHour(
          netSalesPerHour,
          laborCostPerHour
        );

        return {
          labels,
          netSalesPerHour,
          laborCostPercentPerHour,
        };
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getSalesTrend = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const params = parseSalesTrendQuery(req.query);
    const { locationId: _ignored, ...cacheParams } = params;
    await serveDashboardWithCache({
      req,
      res,
      endpoint: "sales-labor.sales-trend",
      params: cacheParams,
      compute: async () => {
        if (isAllLocationsId(params.locationId)) {
          return await buildAllLocationsSalesTrend({
            req,
            query: params,
            locationService,
          });
        }
        const withCreds = await locationService.getByIdWithCredentials(params.locationId);
        if (!withCreds) {
          throw new NotFoundError("Location not found");
        }
        const ctx = buildSalesTrendContext(
          withCreds.location,
          withCreds.squareAccessToken,
          withCreds.homebaseApiKey,
          withCreds.location._id,
        );
        const result = await getSalesTrendData(ctx, params);
        console.log(
          SALES_LABOR_DETAIL_API_LOG,
          "GET /sales-labor/sales-trend",
          {
            squareOrderSeries:
              "rollup attempt when mongo location id present — see server logger [sales-trend] for ROLLUPS vs rollup miss → orders per request",
            laborSeries:
              "mongo_homebase_timecards (getLaborAndHoursTimeSeriesInRangeFromCache)",
            stackedBySource: params.groupBy === "source",
          },
        );
        return result.data;
      },
    });
  } catch (error) {
    if (isLaborDateRangeError(error)) {
      res.status(422).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};

export const getSalesTrendKpi = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const params = parseSalesTrendKpiQuery(req.query);
    const { locationId: _ignored, ...cacheParams } = params;
    await serveDashboardWithCache({
      req,
      res,
      endpoint: "sales-labor.sales-trend-kpi",
      params: cacheParams,
      compute: async () => {
        if (isAllLocationsId(params.locationId)) {
          return await buildAllLocationsSalesTrendKpi({
            req,
            query: params,
            locationService,
          });
        }
        const withCreds = await locationService.getByIdWithCredentials(params.locationId);
        if (!withCreds) {
          throw new NotFoundError("Location not found");
        }
        const ctx = buildSalesTrendContext(
          withCreds.location,
          withCreds.squareAccessToken,
          withCreds.homebaseApiKey,
          withCreds.location._id,
        );
        const data = await getSalesTrendKpiData(ctx, params);
        console.log(SALES_LABOR_DETAIL_API_LOG, "GET /sales-labor/sales-trend-kpi", {
          squareTotals:
            "rollup-first KPI totals when applicable — see server logger [sales-trend] for path details",
          laborTotals: "mongo_homebase_timecards for hours/labor in range",
        });
        return data;
      },
    });
  } catch (error) {
    if (isLaborDateRangeError(error)) {
      res.status(422).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};

export const getSalesByCategory = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const params = parseSalesByCategoryQuery(req.query as Record<string, unknown>);
    const { locationId: _ignored, ...cacheParams } = params;
    await serveDashboardWithCache({
      req,
      res,
      endpoint: "sales-labor.sales-by-category",
      params: cacheParams,
      compute: async () => {
        if (isAllLocationsId(params.locationId)) {
          return await buildSalesByCategoryAllLocations({ req, locationService });
        }
        const withCreds = await locationService.getByIdWithCredentials(params.locationId);
        if (!withCreds) {
          throw new NotFoundError("Location not found");
        }
        const { location, squareAccessToken } = withCreds;
        return await getSalesByCategoryDataForLocation({ params, location, squareAccessToken });
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTimesheet = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId : "";
    await serveDashboardWithCache({
      req,
      res,
      endpoint: "sales-labor.timesheet",
      params: {},
      compute: async () => {
        if (isAllLocationsId(locationId)) {
          const rows = await buildAllLocationsTimesheetRows({ req, locationService });
          return { rows };
        }
        const withCreds = await locationService.getByIdWithCredentials(locationId);
        if (!withCreds) {
          throw new NotFoundError("Location not found");
        }
        const { location } = withCreds;

        const timezone = location.timezone?.trim() || "UTC";
        const homebaseLocationId = location.homebaseLocationId?.trim();
        if (!homebaseLocationId) {
          return { rows: [] };
        }

        const { y, m, d } = getDatePartsInTz(new Date(), timezone);
        const startAt = getStartOfDayUtc(y, m, d, timezone).toISOString();
        const endAt = getEndOfDayUtc(y, m, d, timezone).toISOString();

        const timecards = await loadHomebaseTimecardsForMongoRange(locationId, {
          startAt,
          endAt,
        });

        console.log(SALES_LABOR_DETAIL_API_LOG, "GET /sales-labor/timesheet", {
          source: "mongo_homebase_timecards",
          rowCount: timecards.length,
          range: { startAt, endAt },
        });

        const rows = timecards.map((tc) => {
          const name = [tc.first_name, tc.last_name].filter(Boolean).join(" ") || "Unknown";
          const role = tc.role ?? "";
          const clockIn = tc.clock_in ?? null;
          const clockOut = tc.clock_out ?? null;

          let totalHours = tc.labor?.regular_hours ?? 0;
          if (!clockOut && clockIn) {
            const elapsed = (Date.now() - new Date(clockIn).getTime()) / 3_600_000;
            totalHours = Math.round(elapsed * 100) / 100;
          }

          let status: "On Clock" | "On Break" | "Clocked Out" = "Clocked Out";
          if (!clockOut) {
            const onBreak = tc.timebreaks?.some((tb) => tb.start_at && !tb.end_at);
            status = onBreak ? "On Break" : "On Clock";
          }

          return { name, role, clockIn, clockOut, totalHours, status };
        });

        return { rows };
      },
    });
  } catch (error) {
    next(error);
  }
};

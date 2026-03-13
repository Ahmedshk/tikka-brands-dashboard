import { Request, Response, NextFunction } from "express";
import { getTimecardsForDateRange } from "../services/homebase.service.js";
import { LocationService } from "../services/location.service.js";
import { getNetSalesByCategoryInRange } from "../services/square.service.js";
import {
  getSalesTrendPeriodRange,
  getSalesTrendComparisonRange,
  getStartOfDayUtc,
  getEndOfDayUtc,
  getDatePartsInTz,
} from "../utils/salesTrendDateRange.util.js";
import type {
  GetSalesTrendComparisonRangeOptions,
  PeriodType,
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
  SALES_LABOR_KPI_METRICS,
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
  buildSalesByCategoryResponseData,
  type LocationForSalesLabor,
} from "../utils/salesLaborControllerHelpers.js";

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
      effectivePage == null
        ? undefined
        : { type: "custom" as const, pages: [effectivePage] };
    const allMetricIds = getAllMetricIdsForPage("sales-labor-detail");
    const allowedMetrics = effectivePermissions
      ? filterAllowedMetrics(effectivePermissions, "sales-labor-detail", allMetricIds)
      : [];

    if (queryMetrics?.length) {
      const invalid = queryMetrics.filter(
        (m) =>
          !SALES_LABOR_KPI_METRICS.includes(
            m as (typeof SALES_LABOR_KPI_METRICS)[number]
          )
      );
      if (invalid.length > 0) {
        res.status(400).json({ success: false, message: "Invalid metric" });
        return;
      }
    }

    const metrics =
      queryMetrics?.length
        ? queryMetrics.filter((m) => allowedMetrics.includes(m))
        : allowedMetrics;
    const withCreds = await locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, squareAccessToken, homebaseApiKey } = withCreds;
    const timezone = location.timezone?.trim();
    if (!timezone) {
      res.status(200).json({
        success: true,
        data: buildEmptySalesLaborKPIs(),
      });
      return;
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

    if (metrics.length === 0) {
      res.status(200).json({
        success: true,
        data: buildEmptySalesLaborKPIs(),
      });
      return;
    }

    const [squareData, laborData] = await Promise.all([
      squareLocationId
        ? fetchSquareOrderStatsAndSources(
            squareLocationId,
            range,
            squareAccessToken ?? undefined
          )
        : Promise.resolve(null),
      homebaseLocationId
        ? fetchLaborCostAndHours(
            homebaseLocationId,
            range,
            homebaseApiKey ?? undefined
          )
        : Promise.resolve(null),
    ]);

    const fullData = buildSalesLaborKpisFullData(squareData, laborData);
    const data = buildSalesLaborKpisResponseData(metrics, fullData);
    res.status(200).json({
      success: true,
      data,
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
    const withCreds = await locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, squareAccessToken, homebaseApiKey } = withCreds;
    const timezone = location.timezone?.trim();
    const businessStartTime = location.businessStartTime?.trim() ?? "00:00";
    const labels = buildHourlyBreakdownLabels(businessStartTime);

    if (!timezone) {
      res.status(200).json({
        success: true,
        data: buildEmptyHourlyBreakdownData(labels),
      });
      return;
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
            squareAccessToken ?? undefined
          )
        : Promise.resolve(new Array<number>(24).fill(0)),
      homebaseLocationId
        ? fetchHourlyLaborCostPerHour(
            homebaseLocationId,
            range,
            timezone,
            businessStartTime,
            homebaseApiKey ?? undefined
          )
        : Promise.resolve(new Array<number>(24).fill(0)),
    ]);

    const netSalesPerHour = netSalesCentsBySlot.map((cents) => cents / 100);
    const laborCostPercentPerHour = computeLaborCostPercentPerHour(
      netSalesPerHour,
      laborCostPerHour
    );

    res.status(200).json({
      success: true,
      data: {
        labels,
        netSalesPerHour,
        laborCostPercentPerHour,
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
    const withCreds = await locationService.getByIdWithCredentials(params.locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const ctx = buildSalesTrendContext(
      withCreds.location,
      withCreds.squareAccessToken,
      withCreds.homebaseApiKey,
    );
    const result = await getSalesTrendData(ctx, params);
    res.status(200).json({ success: true, data: result.data });
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
    const withCreds = await locationService.getByIdWithCredentials(params.locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const ctx = buildSalesTrendContext(
      withCreds.location,
      withCreds.squareAccessToken,
      withCreds.homebaseApiKey,
    );
    const data = await getSalesTrendKpiData(ctx, params);
    res.status(200).json({ success: true, data });
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
    const withCreds = await locationService.getByIdWithCredentials(params.locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, squareAccessToken } = withCreds;
    const timezone = location.timezone?.trim() ?? "UTC";
    const businessStartTime = location.businessStartTime?.trim() ?? "00:00";

    const period = getSalesTrendPeriodRange(
      params.periodType as Parameters<typeof getSalesTrendPeriodRange>[0],
      timezone,
      params.periodStart,
      params.periodEnd,
      businessStartTime,
    );
    const comparisonOptions: GetSalesTrendComparisonRangeOptions = {
      businessStartTime,
    };
    if (params.comparisonDate !== undefined) comparisonOptions.customComparisonDate = params.comparisonDate;
    if (params.comparisonStart !== undefined) comparisonOptions.customComparisonStart = params.comparisonStart;
    if (params.comparisonEnd !== undefined) comparisonOptions.customComparisonEnd = params.comparisonEnd;
    if (params.periodType !== undefined) comparisonOptions.periodType = params.periodType as PeriodType;
    const comparison = getSalesTrendComparisonRange(
      params.comparisonType as Parameters<typeof getSalesTrendComparisonRange>[0],
      period.startAt,
      period.endAt,
      timezone,
      comparisonOptions,
    );

    const dataRange = { startAt: period.startAt, endAt: period.endAt };
    const comparisonRange = comparison
      ? { startAt: comparison.startAt, endAt: comparison.endAt }
      : null;

    const squareLocationId = location.squareLocationId?.trim();
    const squareOptions = { accessToken: squareAccessToken ?? undefined };

    let currentResult = { categories: [] as Array<{ name: string; netSalesCents: number }>, totalNetSalesCents: 0 };
    let comparisonResult = { categories: [] as Array<{ name: string; netSalesCents: number }>, totalNetSalesCents: 0 };

    if (squareLocationId) {
      const [current, comp] = await Promise.all([
        getNetSalesByCategoryInRange(squareLocationId, dataRange, squareOptions),
        comparisonRange
          ? getNetSalesByCategoryInRange(squareLocationId, comparisonRange, squareOptions)
          : Promise.resolve({ categories: [], totalNetSalesCents: 0 }),
      ]);
      currentResult = current;
      comparisonResult = comp;
    }

    const data = buildSalesByCategoryResponseData(
      currentResult,
      comparisonResult,
      period.startAt,
      period.endAt,
      comparisonRange,
    );
    res.status(200).json({ success: true, data });
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
    const withCreds = await locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, homebaseApiKey } = withCreds;

    const timezone = location.timezone?.trim() || "UTC";
    const homebaseLocationId = location.homebaseLocationId?.trim();
    if (!homebaseLocationId) {
      res.status(200).json({ success: true, data: { rows: [] } });
      return;
    }

    const { y, m, d } = getDatePartsInTz(new Date(), timezone);
    const startAt = getStartOfDayUtc(y, m, d, timezone).toISOString();
    const endAt = getEndOfDayUtc(y, m, d, timezone).toISOString();

    const timecards = await getTimecardsForDateRange(
      homebaseLocationId,
      startAt,
      endAt,
      { apiKey: homebaseApiKey ?? undefined },
    );

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

    res.status(200).json({ success: true, data: { rows } });
  } catch (error) {
    next(error);
  }
};

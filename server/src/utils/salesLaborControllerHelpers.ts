import type { Response } from "express";
import { assertCanAccessMetrics } from "../config/kpi-metrics.config.js";
import type { RolePermissions } from "../types/rbac.types.js";
import { ForbiddenError } from "./errors.util.js";
import {
  getOrderStatsAndSourcesFromCache,
  getLaborCostInRangeFromCache,
  getTotalHoursInRangeFromCache,
  fetchHourlyNetSalesCentsBySlotFromCache,
  fetchHourlyLaborCostPerHourFromCache,
} from "../services/integrationCacheRead.service.js";
import type { SalesLaborKPIsData } from "../types/salesLabor.types.js";
import type { TimeRange } from "./businessHours.util.js";
import { getBusinessStartTimeRange } from "./timezone.util.js";
import {
  getSalesTrendPeriodRange,
  type PeriodType,
} from "./salesTrendDateRange.util.js";

const LOG_PREFIX = "[Sales Labor]";
export const SALES_LABOR_DETAIL_API_LOG = "[sales-labor-detail-api]";

export const SALES_LABOR_KPI_METRICS = [
  "actualTotalSales",
  "actualLaborCostPercent",
  "totalHours",
  "salesPerManHour",
  "transactionCount",
  "averageCheck",
  "totalDiscounts",
  "totalRefunds",
  "sourcesOfSales",
] as const;

/**
 * Validates sales-labor-detail metrics and RBAC. Returns false if invalid (sends 400/403).
 */
export function validateSalesLaborMetrics(
  res: Response,
  permissions: unknown,
  metrics: string[] | undefined
): boolean {
  if (!metrics?.length) return true;
  const invalid = metrics.filter(
    (m) =>
      !SALES_LABOR_KPI_METRICS.includes(
        m as (typeof SALES_LABOR_KPI_METRICS)[number]
      )
  );
  if (invalid.length > 0) {
    res.status(400).json({ success: false, message: "Invalid metric" });
    return false;
  }
  try {
    assertCanAccessMetrics(permissions as RolePermissions | undefined, "sales-labor-detail", metrics);
    return true;
  } catch (err) {
    if (err instanceof ForbiddenError) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return false;
    }
    throw err;
  }
}

export function buildEmptySalesLaborKPIs(): SalesLaborKPIsData {
  return {
    actualTotalSales: null,
    actualLaborCostPercent: null,
    totalHours: null,
    salesPerManHour: null,
    transactionCount: null,
    averageCheck: null,
    totalDiscounts: null,
    totalRefunds: null,
    totalRefundCount: null,
    sourcesOfSales: [],
  };
}

export interface LocationForSalesLabor {
  timezone: string | undefined;
  businessStartTime: string | undefined;
  squareLocationId: string | undefined;
  homebaseLocationId: string | undefined;
}

export function getSalesLaborTimeRange(location: LocationForSalesLabor): TimeRange {
  const timezone = location.timezone?.trim();
  const businessStartTime = location.businessStartTime?.trim() ?? "00:00";
  return getBusinessStartTimeRange(timezone ?? "America/Denver", businessStartTime);
}

export interface SalesLaborPeriodParams {
  periodType: PeriodType;
  periodStart?: string | undefined;
  periodEnd?: string | undefined;
}

/**
 * Compute the time range for a Sales & Labor request from period params.
 * Defaults to the business-day "today" range (the prior behavior) when no period is supplied.
 */
export function getSalesLaborRangeForPeriod(
  location: LocationForSalesLabor,
  period: SalesLaborPeriodParams,
): TimeRange {
  const timezone = location.timezone?.trim() ?? "America/Denver";
  const businessStartTime = location.businessStartTime?.trim() ?? "00:00";
  const result = getSalesTrendPeriodRange(
    period.periodType,
    timezone,
    period.periodStart,
    period.periodEnd,
    businessStartTime,
  );
  return { startAt: result.startAt, endAt: result.endAt };
}

/** Parse periodType/periodStart/periodEnd off req.query into a strict SalesLaborPeriodParams. */
export function parseSalesLaborPeriodQuery(query: Record<string, unknown>): SalesLaborPeriodParams {
  const rawType = typeof query.periodType === "string" ? query.periodType : "today";
  const allowed: ReadonlyArray<PeriodType> = [
    "today",
    "last7days",
    "last30days",
    "last52weeks",
    "thisWeek",
    "thisMonth",
    "thisYear",
    "custom",
  ];
  const periodType = (allowed as readonly string[]).includes(rawType)
    ? (rawType as PeriodType)
    : "today";
  const periodStart =
    typeof query.periodStart === "string" && query.periodStart.length > 0
      ? query.periodStart
      : undefined;
  const periodEnd =
    typeof query.periodEnd === "string" && query.periodEnd.length > 0
      ? query.periodEnd
      : undefined;
  return { periodType, periodStart, periodEnd };
}

/**
 * Fetches Square order stats and sources; returns null on error.
 */
export async function fetchSquareOrderStatsAndSources(
  _squareLocationId: string,
  range: TimeRange,
  _accessToken: string | undefined,
  cacheLocationId?: string,
  rollupCtx?: { timezone: string; businessStartTime: string },
): Promise<{
  actualTotalSales: number;
  transactionCount: number;
  totalDiscounts: number;
  totalRefunds: number;
  totalRefundCount: number;
  sourcesOfSales: NonNullable<
    Awaited<ReturnType<typeof getOrderStatsAndSourcesFromCache>>
  >["sourcesOfSales"];
} | null> {
  try {
    if (!cacheLocationId?.trim()) {
      return {
        actualTotalSales: 0,
        transactionCount: 0,
        totalDiscounts: 0,
        totalRefunds: 0,
        totalRefundCount: 0,
        sourcesOfSales: [],
      };
    }
    const cached = await getOrderStatsAndSourcesFromCache(
      cacheLocationId.trim(),
      range,
      rollupCtx,
      "GET /sales-labor/kpis Square stats + sourcesOfSales",
    );
    return (
      cached ?? {
        actualTotalSales: 0,
        transactionCount: 0,
        totalDiscounts: 0,
        totalRefunds: 0,
        totalRefundCount: 0,
        sourcesOfSales: [],
      }
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} Square order stats error:`, err);
    return null;
  }
}

/**
 * Fetches labor cost and total hours; returns null on error.
 * When `rollupCtx` is provided, attempts the daily Homebase rollup fast path
 * before falling back to per-timecard scans (handled inside the cache reads).
 */
export async function fetchLaborCostAndHours(
  _homebaseLocationId: string,
  range: TimeRange,
  _apiKey: string | undefined,
  cacheLocationId?: string,
  rollupCtx?: { timezone: string; businessStartTime: string },
): Promise<{ laborCost: number; totalHours: number } | null> {
  try {
    if (!cacheLocationId?.trim()) {
      return { laborCost: 0, totalHours: 0 };
    }
    const id = cacheLocationId.trim();
    const [laborCost, totalHours] = await Promise.all([
      getLaborCostInRangeFromCache(
        id,
        range,
        rollupCtx,
        "GET /sales-labor/kpis laborCost",
      ),
      getTotalHoursInRangeFromCache(
        id,
        range,
        rollupCtx,
        "GET /sales-labor/kpis totalHours",
      ),
    ]);
    console.log(SALES_LABOR_DETAIL_API_LOG, "GET /sales-labor/kpis labor cost + hours", {
      laborSource: rollupCtx ? "rollup_or_timecards" : "mongo_homebase_timecards",
      detail:
        "getLaborCostInRangeFromCache + getTotalHoursInRangeFromCache (rollup fast path with timecard fallback)",
    });
    return { laborCost, totalHours };
  } catch (err) {
    console.error(`${LOG_PREFIX} Homebase error:`, err);
    return null;
  }
}

/**
 * Builds full SalesLaborKPIsData from raw Square + Homebase results.
 */
export function buildSalesLaborKpisFullData(
  squareData: Awaited<ReturnType<typeof fetchSquareOrderStatsAndSources>>,
  laborData: Awaited<ReturnType<typeof fetchLaborCostAndHours>>
): SalesLaborKPIsData {
  const actualTotalSales = squareData?.actualTotalSales ?? null;
  const laborCost = laborData?.laborCost ?? null;
  const totalHours = laborData?.totalHours ?? null;
  const transactionCount = squareData?.transactionCount ?? null;
  const totalDiscounts = squareData?.totalDiscounts ?? null;
  const totalRefunds = squareData?.totalRefunds ?? null;
  const totalRefundCount = squareData?.totalRefundCount ?? null;
  const sourcesOfSales = squareData?.sourcesOfSales ?? [];

  let actualLaborCostPercent: number | null = null;
  if (
    actualTotalSales !== null &&
    laborCost !== null &&
    actualTotalSales > 0
  ) {
    actualLaborCostPercent = (laborCost / actualTotalSales) * 100;
  }

  let salesPerManHour: number | null = null;
  if (actualTotalSales !== null && totalHours !== null && totalHours > 0) {
    salesPerManHour = actualTotalSales / totalHours;
  }

  let averageCheck: number | null = null;
  if (
    actualTotalSales !== null &&
    transactionCount !== null &&
    transactionCount > 0
  ) {
    averageCheck = actualTotalSales / transactionCount;
  }

  return {
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
}

/**
 * Returns full data or filters by requested metrics (including totalRefundCount when totalRefunds requested).
 */
export function buildSalesLaborKpisResponseData(
  metrics: string[] | undefined,
  fullData: SalesLaborKPIsData
): Partial<SalesLaborKPIsData> | SalesLaborKPIsData {
  if (!metrics?.length) return fullData;
  const filtered: Partial<SalesLaborKPIsData> = {};
  const fullDataRecord = fullData as unknown as Record<string, unknown>;
  for (const k of metrics) {
    if (k in fullData) {
      (filtered as Record<string, unknown>)[k] = fullDataRecord[k];
    }
  }
  if (metrics.includes("totalRefunds")) {
    filtered.totalRefundCount = fullData.totalRefundCount;
  }
  return filtered;
}

// --- Hourly breakdown helpers ---

export function formatHourLabel(hour24: number): string {
  if (hour24 === 0) return "12 am";
  if (hour24 === 12) return "12 pm";
  if (hour24 < 12) return `${String(hour24).padStart(2, "0")} am`;
  return `${String(hour24 - 12).padStart(2, "0")} pm`;
}

export function buildHourlyBreakdownLabels(businessStartTime: string): string[] {
  const startHour = Number.parseInt(
    (businessStartTime ?? "00:00").trim().split(":")[0] ?? "0",
    10
  );
  const labels: string[] = [];
  for (let slot = 0; slot < 24; slot++) {
    const hour24 = (startHour + slot) % 24;
    labels.push(formatHourLabel(hour24));
  }
  return labels;
}

export async function fetchHourlyNetSalesCentsBySlot(
  _squareLocationId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  _accessToken: string | undefined,
  cacheLocationId?: string,
): Promise<number[]> {
  if (!cacheLocationId?.trim()) {
    return new Array<number>(24).fill(0);
  }
  try {
    return fetchHourlyNetSalesCentsBySlotFromCache(
      cacheLocationId.trim(),
      range,
      timezone,
      businessStartTime,
      "GET /sales-labor/hourly-breakdown net sales by slot",
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} Square hourly orders error:`, err);
    return new Array<number>(24).fill(0);
  }
}

export async function fetchHourlyLaborCostPerHour(
  _homebaseLocationId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  _apiKey: string | undefined,
  cacheLocationId?: string,
): Promise<number[]> {
  if (!cacheLocationId?.trim()) {
    return new Array<number>(24).fill(0);
  }
  try {
    const slots = await fetchHourlyLaborCostPerHourFromCache(
      cacheLocationId.trim(),
      range,
      timezone,
      businessStartTime,
    );
    console.log(
      SALES_LABOR_DETAIL_API_LOG,
      "GET /sales-labor/hourly-breakdown labor cost per hour by slot",
      {
        laborHourlySource: "mongo_homebase_timecards",
        detail:
          "fetchHourlyLaborCostPerHourFromCache — no labor rollup; aggregated from synced timecards",
        slotCount: slots.length,
      },
    );
    return slots;
  } catch (err) {
    console.error(`${LOG_PREFIX} Homebase hourly labor error:`, err);
    return new Array<number>(24).fill(0);
  }
}

export function computeLaborCostPercentPerHour(
  netSalesPerHour: number[],
  laborCostPerHour: number[]
): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < 24; i++) {
    const sales = netSalesPerHour[i] ?? 0;
    const labor = laborCostPerHour[i] ?? 0;
    result.push(sales > 0 ? (labor / sales) * 100 : null);
  }
  return result;
}

export interface HourlyBreakdownResponseData {
  labels: string[];
  netSalesPerHour: number[];
  laborCostPercentPerHour: (number | null)[];
}

export function buildEmptyHourlyBreakdownData(
  labels: string[]
): HourlyBreakdownResponseData {
  return {
    labels,
    netSalesPerHour: new Array(24).fill(0),
    laborCostPercentPerHour: new Array(24).fill(null),
  };
}

// --- Sales by category helpers ---

export interface SalesByCategoryQueryParams {
  locationId: string;
  periodType: string;
  periodStart: string | undefined;
  periodEnd: string | undefined;
  comparisonType: string;
  comparisonDate: string | undefined;
  comparisonStart: string | undefined;
  comparisonEnd: string | undefined;
}

export function parseSalesByCategoryQuery(
  query: Record<string, unknown>
): SalesByCategoryQueryParams {
  return {
    locationId:
      typeof query.locationId === "string" ? query.locationId : "",
    periodType: (query.periodType as string) || "last30days",
    periodStart:
      typeof query.periodStart === "string" ? query.periodStart : undefined,
    periodEnd:
      typeof query.periodEnd === "string" ? query.periodEnd : undefined,
    comparisonType: (query.comparisonType as string) || "priorYear",
    comparisonDate:
      typeof query.comparisonDate === "string"
        ? query.comparisonDate
        : undefined,
    comparisonStart:
      typeof query.comparisonStart === "string"
        ? query.comparisonStart
        : undefined,
    comparisonEnd:
      typeof query.comparisonEnd === "string" ? query.comparisonEnd : undefined,
  };
}

export interface SalesByCategoryResult {
  categories: Array<{ name: string; netSalesCents: number }>;
  totalNetSalesCents: number;
}

export interface SalesByCategoryResponseData {
  current: {
    categories: Array<{ label: string; netSales: number }>;
    totalNetSales: number;
  };
  comparison: {
    categories: Array<{ label: string; netSales: number }>;
    totalNetSales: number;
  };
  periodRange: { startAt: string; endAt: string };
  comparisonRange: { startAt: string; endAt: string } | null;
}

export function buildSalesByCategoryResponseData(
  currentResult: SalesByCategoryResult,
  comparisonResult: SalesByCategoryResult,
  periodStartAt: string,
  periodEndAt: string,
  comparisonRange: { startAt: string; endAt: string } | null
): SalesByCategoryResponseData {
  const allNames = new Set<string>();
  for (const c of currentResult.categories) allNames.add(c.name);
  for (const c of comparisonResult.categories) allNames.add(c.name);
  const currentByName = new Map(
    currentResult.categories.map((c) => [c.name, c.netSalesCents])
  );
  const comparisonByName = new Map(
    comparisonResult.categories.map((c) => [c.name, c.netSalesCents])
  );
  const merged = Array.from(allNames)
    .map((name) => ({
      label: name,
      netSales: (currentByName.get(name) ?? 0) / 100,
      comparisonNetSales: (comparisonByName.get(name) ?? 0) / 100,
    }))
    .sort((a, b) => b.netSales - a.netSales);

  return {
    current: {
      categories: merged.map(({ label, netSales }) => ({ label, netSales })),
      totalNetSales: currentResult.totalNetSalesCents / 100,
    },
    comparison: {
      categories: merged.map(({ label, comparisonNetSales }) => ({
        label,
        netSales: comparisonNetSales,
      })),
      totalNetSales: comparisonResult.totalNetSalesCents / 100,
    },
    periodRange: { startAt: periodStartAt, endAt: periodEndAt },
    comparisonRange,
  };
}

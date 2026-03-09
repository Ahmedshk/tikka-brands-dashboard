import type { Response } from "express";
import { assertCanAccessMetrics, type RolePermissions } from "../config/kpi-metrics.config.js";
import { ForbiddenError } from "./errors.util.js";
import {
  getLaborCostInRange,
  getTotalHoursInRange,
  getLaborCostPerHourInRange,
} from "../services/homebase.service.js";
import {
  getOrderStatsAndSourcesInRange,
  searchOrdersInRange,
} from "../services/square.service.js";
import type { SalesLaborKPIsData } from "../types/salesLabor.types.js";
import type { TimeRange } from "./businessHours.util.js";
import { getBusinessStartTimeRange, getBusinessHourIndex } from "./timezone.util.js";

const LOG_PREFIX = "[Sales Labor]";

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

/**
 * Fetches Square order stats and sources; returns null on error.
 */
export async function fetchSquareOrderStatsAndSources(
  squareLocationId: string,
  range: TimeRange,
  accessToken: string | undefined
): Promise<{
  actualTotalSales: number;
  transactionCount: number;
  totalDiscounts: number;
  totalRefunds: number;
  totalRefundCount: number;
  sourcesOfSales: Awaited<ReturnType<typeof getOrderStatsAndSourcesInRange>>["sourcesOfSales"];
} | null> {
  try {
    const { orderStats, sourcesOfSales } = await getOrderStatsAndSourcesInRange(
      squareLocationId,
      range,
      { accessToken }
    );
    return {
      actualTotalSales: orderStats.netSalesCents / 100,
      transactionCount: orderStats.orderCount,
      totalDiscounts: orderStats.totalDiscountCents / 100,
      totalRefunds: orderStats.totalRefundCents / 100,
      totalRefundCount: orderStats.refundCount,
      sourcesOfSales,
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} Square order stats error:`, err);
    return null;
  }
}

/**
 * Fetches labor cost and total hours; returns null on error.
 */
export async function fetchLaborCostAndHours(
  homebaseLocationId: string,
  range: TimeRange,
  apiKey: string | undefined
): Promise<{ laborCost: number; totalHours: number } | null> {
  try {
    const homebaseOptions = { apiKey };
    const [laborCost, totalHours] = await Promise.all([
      getLaborCostInRange(homebaseLocationId, range, homebaseOptions),
      getTotalHoursInRange(homebaseLocationId, range, homebaseOptions),
    ]);
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
  squareLocationId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  accessToken: string | undefined
): Promise<number[]> {
  const netSalesCentsBySlot = new Array<number>(24).fill(0);
  try {
    const orders = await searchOrdersInRange(squareLocationId, range, {
      accessToken,
    });
    for (const order of orders) {
      const slot = getBusinessHourIndex(
        order.created_at,
        timezone,
        businessStartTime
      );
      if (slot >= 0 && slot < 24) {
        netSalesCentsBySlot[slot] =
          (netSalesCentsBySlot[slot] ?? 0) + order.amountCents;
      }
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Square hourly orders error:`, err);
  }
  return netSalesCentsBySlot;
}

export async function fetchHourlyLaborCostPerHour(
  homebaseLocationId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  apiKey: string | undefined
): Promise<number[]> {
  try {
    return await getLaborCostPerHourInRange(
      homebaseLocationId,
      range,
      timezone,
      businessStartTime,
      { apiKey }
    );
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

/**
 * MarketMan service: fetches inventory and food cost KPIs for a buyer (location).
 * Uses BuyerGuid from location and date ranges in UTC (yyyy/MM/dd HH:mm:ss).
 */

import {
  marketManRequest,
  formatMarketManDateUtc,
  getMarketManToken,
} from "./marketman.client.js";
import {
  getStartOfDayUtc,
  getDatePartsInTz,
} from "../utils/salesTrendDateRange.util.js";

export interface VarianceItem {
  label: string;
  varianceCost: number;
  actualCost?: number;
  theoreticalCost?: number;
  actualQuantity?: number;
  theoreticalQuantity?: number;
  uom?: string;
}

export interface InventoryKPIsResult {
  currentFoodCost: number | null;
  inventoryValue: number | null;
  wasteCost: number | null;
  foodCostPercent: number | null;
  theoreticalUsage: number | null;
  theoreticalUsagePercent: number | null;
  varianceItems: VarianceItem[];
  pendingOrdersCount: number | null;
  countPeriodStart?: string | null;
  countPeriodEnd?: string | null;
  pendingOrdersPeriodStart?: string | null;
  pendingOrdersPeriodEnd?: string | null;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function addDays(
  y: number,
  m: number,
  d: number,
  delta: number,
): { y: number; m: number; d: number } {
  const date = new Date(y, m, d + delta);
  return { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() };
}

/**
 * End of day (23:59:59.999) in timezone as UTC Date.
 */
function getEndOfDayUtc(
  y: number,
  m: number,
  d: number,
  timezone: string,
): Date {
  const start = getStartOfDayUtc(y, m, d, timezone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Get start and end of "today" in a given timezone as UTC Dates.
 */
function getTodayUtcRange(timezone: string): { from: Date; to: Date } {
  const now = new Date();
  const { y, m, d } = getDatePartsInTz(now, timezone);
  const from = getStartOfDayUtc(y, m, d, timezone);
  const to = getEndOfDayUtc(y, m, d, timezone);
  return { from, to };
}

/**
 * Get start and end of the current week (Sun–Sat) in timezone as UTC Dates.
 */
function getCurrentWeekUtcRange(timezone: string): { from: Date; to: Date } {
  const now = new Date();
  const { y, m, d } = getDatePartsInTz(now, timezone);
  const dayOfWeek = new Date(y, m, d).getDay();
  const sun = addDays(y, m, d, -dayOfWeek);
  const sat = addDays(sun.y, sun.m, sun.d, 6);
  const from = getStartOfDayUtc(sun.y, sun.m, sun.d, timezone);
  const to = getEndOfDayUtc(sat.y, sat.m, sat.d, timezone);
  return { from, to };
}

export async function getInventoryKPIs(
  buyerGuid: string,
  timezone: string,
): Promise<InventoryKPIsResult> {
  const result: InventoryKPIsResult = {
    currentFoodCost: null,
    inventoryValue: null,
    wasteCost: null,
    foodCostPercent: null,
    theoreticalUsage: null,
    theoreticalUsagePercent: null,
    varianceItems: [],
    pendingOrdersCount: null,
    countPeriodStart: null,
    countPeriodEnd: null,
    pendingOrdersPeriodStart: null,
    pendingOrdersPeriodEnd: null,
  };

  if (!buyerGuid?.trim()) {
    return result;
  }

  await getMarketManToken();

  const [actualTheoResult, pendingOrdersResult] = await Promise.allSettled([
    fetchActualTheoDataForCountDate(buyerGuid),
    fetchPendingOrdersByDeliveryDate(buyerGuid, timezone),
  ]);

  if (actualTheoResult.status === "fulfilled" && actualTheoResult.value) {
    if (actualTheoResult.value.currentFoodCost != null)
      result.currentFoodCost = actualTheoResult.value.currentFoodCost;
    if (actualTheoResult.value.inventoryValue != null)
      result.inventoryValue = actualTheoResult.value.inventoryValue;
    if (actualTheoResult.value.wasteCost != null)
      result.wasteCost = actualTheoResult.value.wasteCost;
    if (actualTheoResult.value.foodCostPercent != null)
      result.foodCostPercent = actualTheoResult.value.foodCostPercent;
    if (actualTheoResult.value.theoreticalUsage != null)
      result.theoreticalUsage = actualTheoResult.value.theoreticalUsage;
    if (actualTheoResult.value.theoreticalUsagePercent != null)
      result.theoreticalUsagePercent = actualTheoResult.value.theoreticalUsagePercent;
    result.countPeriodStart = actualTheoResult.value.countPeriodStart ?? null;
    result.countPeriodEnd = actualTheoResult.value.countPeriodEnd ?? null;
    if (Array.isArray(actualTheoResult.value.varianceItems))
      result.varianceItems = actualTheoResult.value.varianceItems;
  }
  if (pendingOrdersResult.status === "fulfilled" && pendingOrdersResult.value) {
    result.pendingOrdersCount = pendingOrdersResult.value.count;
    result.pendingOrdersPeriodStart = pendingOrdersResult.value.periodStart;
    result.pendingOrdersPeriodEnd = pendingOrdersResult.value.periodEnd;
  }

  return result;
}

const VALID_DATE_REGEX = /^\d{4}\/\d{2}\/\d{2}$/;
function filterValidDates(arr: unknown): string[] {
  return Array.isArray(arr)
    ? arr.filter(
        (d): d is string =>
          typeof d === "string" && VALID_DATE_REGEX.test(d),
      )
    : [];
}

/**
 * Get valid count dates from GetValidCountDates (StartDateCountsUTC and EndDateCountsUTC).
 */
async function getValidCountDates(buyerGuid: string): Promise<{
  startDates: string[];
  endDates: string[];
} | null> {
  try {
    const data = await marketManRequest<{
      StartDateCountsUTC?: unknown;
      EndDateCountsUTC?: unknown;
    }>("/buyers/inventory/GetValidCountDates", {}, buyerGuid);
    const startDates = filterValidDates(data?.StartDateCountsUTC);
    const endDates = filterValidDates(data?.EndDateCountsUTC);
    if (!startDates.length || !endDates.length) return null;
    return { startDates, endDates };
  } catch (err) {
    console.error("[MarketMan] GetValidCountDates error:", err);
    return null;
  }
}

/**
 * Fetches GetActualTheoDataByBuyer for the count period (last two valid count dates)
 * and returns current food cost, inventory value, and the period start/end for display.
 */
async function fetchActualTheoDataForCountDate(buyerGuid: string): Promise<{
  currentFoodCost: number | null;
  inventoryValue: number | null;
  wasteCost: number | null;
  foodCostPercent: number | null;
  theoreticalUsage: number | null;
  theoreticalUsagePercent: number | null;
  varianceItems: VarianceItem[];
  countPeriodStart: string | null;
  countPeriodEnd: string | null;
}> {
  try {
    const validCountDates = await getValidCountDates(buyerGuid);
    if (!validCountDates)
      return {
        currentFoodCost: null,
        inventoryValue: null,
        wasteCost: null,
        foodCostPercent: null,
        theoreticalUsage: null,
        theoreticalUsagePercent: null,
        varianceItems: [],
        countPeriodStart: null,
        countPeriodEnd: null,
      };
    // Count end = last EndDateCountsUTC; count start = latest StartDateCountsUTC that is not greater than count end
    const countEnd: string | null =
      validCountDates.endDates.at(-1) ?? null;
    if (!countEnd) {
      return {
        currentFoodCost: null,
        inventoryValue: null,
        wasteCost: null,
        foodCostPercent: null,
        theoreticalUsage: null,
        theoreticalUsagePercent: null,
        varianceItems: [],
        countPeriodStart: null,
        countPeriodEnd: null,
      };
    }
    const startNotAfterEnd = validCountDates.startDates.filter(
      (d) => d <= countEnd,
    );
    const countStart: string | null =
      startNotAfterEnd.length > 0
        ? startNotAfterEnd.sort((a, b) => (a < b ? -1 : 1)).at(-1) ?? null
        : null;
    if (!countStart) {
      return {
        currentFoodCost: null,
        inventoryValue: null,
        wasteCost: null,
        foodCostPercent: null,
        theoreticalUsage: null,
        theoreticalUsagePercent: null,
        varianceItems: [],
        countPeriodStart: null,
        countPeriodEnd: null,
      };
    }
    const data = await marketManRequest<{
      ActualTheoDataRows?: Array<{
        COGS?: number;
        ClosingValue?: number;
        ItemName?: string;
        VarianceValue?: number;
        TheoreticalUsageCost?: number;
        ActualUsage?: number;
        TheoreticalUsage?: number;
        UOM?: string;
      }>;
      ActualTheoCategoriesTotalsRows?: Array<{
        ActualUsage?: number;
        ActualUsagePercent?: number;
        TheoreticalUsage?: number;
        TheoreticalUsagePercent?: number;
        WasteValue?: number;
      }>;
    }>(
      "/buyers/inventory/GetActualTheoDataByBuyer",
      {
        StartDateUTC: countStart,
        EndDateUTC: countEnd,
      },
      buyerGuid,
    );
    if (!Array.isArray(data?.ActualTheoDataRows))
      return {
        currentFoodCost: null,
        inventoryValue: null,
        wasteCost: null,
        foodCostPercent: null,
        theoreticalUsage: null,
        theoreticalUsagePercent: null,
        varianceItems: [],
        countPeriodStart: countStart,
        countPeriodEnd: countEnd,
      };
    const categoryTotals = data.ActualTheoCategoriesTotalsRows;
    const hasCategoryTotals =
      Array.isArray(categoryTotals) && categoryTotals.length > 0;
    const firstCategory = hasCategoryTotals ? categoryTotals[0] : undefined;
    const currentFoodCost = roundTo2(
      firstCategory?.ActualUsage != null
        ? Number(firstCategory.ActualUsage)
        : data.ActualTheoDataRows.reduce(
            (s, row) => s + (Number(row.COGS) || 0),
            0,
          ),
    );
    const wasteCost =
      firstCategory?.WasteValue != null
        ? roundTo2(Number(firstCategory.WasteValue))
        : null;
    const rawPercent = firstCategory?.ActualUsagePercent;
    const foodCostPercent =
      rawPercent != null ? roundTo2(Number(rawPercent) * 100) : null;
    const theoreticalUsage =
      firstCategory?.TheoreticalUsage != null
        ? roundTo2(Number(firstCategory.TheoreticalUsage))
        : null;
    const rawTheoPercent = firstCategory?.TheoreticalUsagePercent;
    const theoreticalUsagePercent =
      rawTheoPercent != null ? roundTo2(Number(rawTheoPercent) * 100) : null;
    const inventoryValue = roundTo2(
      data.ActualTheoDataRows.reduce(
        (s, row) => s + (Number(row.ClosingValue) || 0),
        0,
      ),
    );
    const varianceItems: VarianceItem[] = data.ActualTheoDataRows.map(
      (row) => {
        const item: VarianceItem = {
          label: row.ItemName ?? "—",
          varianceCost: roundTo2(Number(row.VarianceValue) ?? 0),
        };
        if (row.COGS != null) item.actualCost = roundTo2(Number(row.COGS));
        if (row.TheoreticalUsageCost != null)
          item.theoreticalCost = roundTo2(Number(row.TheoreticalUsageCost));
        if (row.ActualUsage != null) item.actualQuantity = Number(row.ActualUsage);
        if (row.TheoreticalUsage != null)
          item.theoreticalQuantity = Number(row.TheoreticalUsage);
        if (row.UOM != null && String(row.UOM).trim() !== "")
          item.uom = String(row.UOM).trim();
        return item;
      },
    );
    return {
      currentFoodCost,
      inventoryValue,
      wasteCost,
      foodCostPercent,
      theoreticalUsage,
      theoreticalUsagePercent,
      varianceItems,
      countPeriodStart: countStart,
      countPeriodEnd: countEnd,
    };
  } catch (err) {
    console.error("[MarketMan] GetActualTheoDataByBuyer error:", err);
    return {
      currentFoodCost: null,
      inventoryValue: null,
      wasteCost: null,
      foodCostPercent: null,
      theoreticalUsage: null,
      theoreticalUsagePercent: null,
      varianceItems: [],
      countPeriodStart: null,
      countPeriodEnd: null,
    };
  }
}

async function fetchWeeklyWasteCost(
  buyerGuid: string,
  fromDate: string,
  toDate: string,
): Promise<number | null> {
  try {
    const data = await marketManRequest<{
      Events?: Array<{ Cost?: number; Amount?: number; TotalCost?: number }>;
      Items?: Array<{ Cost?: number; Amount?: number }>;
    }>(
      "/buyers/inventory/GetWasteEvents",
      { StartDateUTC: fromDate, EndDateUTC: toDate },
      buyerGuid,
    );
    let list: Array<{ Cost?: number; Amount?: number; TotalCost?: number }> =
      [];
    if (Array.isArray(data.Events)) list = data.Events;
    else if (Array.isArray(data.Items)) list = data.Items;
    const sum = list.reduce(
      (s, e) => s + (Number(e.Cost ?? e.Amount ?? e.TotalCost) || 0),
      0,
    );
    return sum > 0 ? sum : null;
  } catch (err) {
    console.error("[MarketMan] GetWasteEvents error:", err);
  }
  return null;
}

/** Format date-only yyyy/MM/dd from timezone-local (y, m, d) with m 0-based. */
function formatDateOnly(y: number, m: number, d: number): string {
  return `${y}/${String(m + 1).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

function isReceivedOrCancelled(order: {
  OrderStatus?: string;
  OrderStatusUIName?: string;
}): boolean {
  const s = String(order.OrderStatus ?? order.OrderStatusUIName ?? "").toLowerCase();
  if (s === "received") return true;
  if (s.includes("cancelled")) return true;
  return false;
}

/**
 * Fetch pending orders (not yet received, not cancelled) with delivery date from 30 days ago through today.
 * Uses GetOrdersByDeliveryDate; returns count and period (date-only) for the card.
 */
async function fetchPendingOrdersByDeliveryDate(
  buyerGuid: string,
  timezone: string,
): Promise<{ count: number; periodStart: string; periodEnd: string } | null> {
  try {
    const now = new Date();
    const { y, m, d } = getDatePartsInTz(now, timezone);
    const todayEnd = getEndOfDayUtc(y, m, d, timezone);
    const thirtyDaysAgo = addDays(y, m, d, -30);
    const from30DaysAgoStart = getStartOfDayUtc(
      thirtyDaysAgo.y,
      thirtyDaysAgo.m,
      thirtyDaysAgo.d,
      timezone,
    );
    const dateTimeFromUTC = formatMarketManDateUtc(from30DaysAgoStart);
    const dateTimeToUTC = formatMarketManDateUtc(todayEnd);

    const data = await marketManRequest<{
      Orders?: Array<{ OrderStatus?: string; OrderStatusUIName?: string }>;
    }>(
      "/buyers/orders/GetOrdersByDeliveryDate",
      {
        DateTimeFromUTC: dateTimeFromUTC,
        DateTimeToUTC: dateTimeToUTC,
      },
      buyerGuid,
    );
    const orders = Array.isArray(data.Orders) ? data.Orders : [];
    const pendingCount = orders.filter((o) => !isReceivedOrCancelled(o)).length;
    const periodStart = formatDateOnly(
      thirtyDaysAgo.y,
      thirtyDaysAgo.m,
      thirtyDaysAgo.d,
    );
    const periodEnd = formatDateOnly(y, m, d);
    return { count: pendingCount, periodStart, periodEnd };
  } catch (err) {
    console.error("[MarketMan] GetOrdersByDeliveryDate error:", err);
  }
  return null;
}

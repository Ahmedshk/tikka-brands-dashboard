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

/** MarketMan order line item (from Orders[].Items). */
export interface MarketManOrderItem {
  ItemName?: string;
  SKU?: string;
  Quantity?: number;
  Price?: number;
  PriceTotal?: number;
  ItemMeasureTypeName?: string;
  PackQuantity?: number;
  PacksPerCase?: number;
}

/** MarketMan order (from GetOrdersByDeliveryDate / GetOrdersBySentDate). */
export interface MarketManOrder {
  OrderNumber?: string;
  BuyerName?: string;
  BuyerGuid?: string;
  VendorName?: string;
  OrderStatusID?: number;
  OrderStatus?: string;
  OrderStatusUIName?: string;
  DeliveryDateUTC?: string;
  SentDateUTC?: string;
  PriceTotalWithVAT?: number;
  PriceTotalWithoutVAT?: number;
  Comments?: string;
  VendorGuid?: string;
  Items?: MarketManOrderItem[];
}

export interface GetOrdersByDeliveryDateResponse {
  Orders?: MarketManOrder[];
  IsSuccess?: boolean;
  ErrorMessage?: string | null;
  ErrorCode?: string | null;
}

export interface GetOrdersBySentDateResponse {
  Orders?: MarketManOrder[];
  IsSuccess?: boolean;
  ErrorMessage?: string | null;
  ErrorCode?: string | null;
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
 * End of day in timezone as UTC Date: 23:59:59.999 in store TZ.
 * E.g. Mountain 2026-02-22 23:59:59.999 → 2026-02-23 06:59:59.999 UTC.
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

/** Previous week (Sun–Sat) in timezone as UTC Dates. */
function getLastWeekUtcRange(timezone: string): { from: Date; to: Date } {
  const { from } = getCurrentWeekUtcRange(timezone);
  const fromDate = new Date(from);
  const sunLast = addDays(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
    -7,
  );
  const satLast = addDays(sunLast.y, sunLast.m, sunLast.d, 6);
  return {
    from: getStartOfDayUtc(sunLast.y, sunLast.m, sunLast.d, timezone),
    to: getEndOfDayUtc(satLast.y, satLast.m, satLast.d, timezone),
  };
}

/** This week from Sunday 00:00 through today 23:59 in timezone as UTC Dates. */
function getThisWeekThroughTodayUtcRange(timezone: string): {
  from: Date;
  to: Date;
  periodStart: string;
  periodEnd: string;
} {
  const now = new Date();
  const { y, m, d } = getDatePartsInTz(now, timezone);
  const dayOfWeek = new Date(y, m, d).getDay();
  const sun = addDays(y, m, d, -dayOfWeek);
  const from = getStartOfDayUtc(sun.y, sun.m, sun.d, timezone);
  const to = getEndOfDayUtc(y, m, d, timezone);
  return {
    from,
    to,
    periodStart: formatDateOnly(sun.y, sun.m, sun.d),
    periodEnd: formatDateOnly(y, m, d),
  };
}

/** Last week (Sun–Sat) in timezone as UTC Dates with date-only strings for display. */
function getLastWeekUtcRangeWithPeriod(timezone: string): {
  from: Date;
  to: Date;
  periodStart: string;
  periodEnd: string;
} {
  const { from } = getCurrentWeekUtcRange(timezone);
  const fromDate = new Date(from);
  const sunLast = addDays(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
    -7,
  );
  const satLast = addDays(sunLast.y, sunLast.m, sunLast.d, 6);
  return {
    from: getStartOfDayUtc(sunLast.y, sunLast.m, sunLast.d, timezone),
    to: getEndOfDayUtc(satLast.y, satLast.m, satLast.d, timezone),
    periodStart: formatDateOnly(sunLast.y, sunLast.m, sunLast.d),
    periodEnd: formatDateOnly(satLast.y, satLast.m, satLast.d),
  };
}

export type PendingOrdersPeriod = "thisWeek" | "lastWeek";

const ACTUAL_THEO_METRICS = [
  "currentFoodCost",
  "inventoryValue",
  "wasteCost",
  "foodCostPercent",
  "theoreticalUsage",
  "theoreticalUsagePercent",
  "varianceItems",
] as const;

export async function getInventoryKPIs(
  buyerGuid: string,
  timezone: string,
  requestedMetrics?: string[],
  pendingOrdersPeriod: PendingOrdersPeriod = "thisWeek",
  countPeriodStart?: string | null,
  countPeriodEnd?: string | null,
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

  const needActualTheo =
    !requestedMetrics?.length ||
    requestedMetrics.some((m) =>
      (ACTUAL_THEO_METRICS as readonly string[]).includes(m),
    );
  const needPendingOrders =
    !requestedMetrics?.length ||
    requestedMetrics.includes("pendingOrdersCount");

  await getMarketManToken();

  const promises: Promise<unknown>[] = [];
  if (needActualTheo) {
    const hasCountPeriodOverride =
      countPeriodStart != null &&
      countPeriodEnd != null &&
      String(countPeriodStart).trim() !== "" &&
      String(countPeriodEnd).trim() !== "";
    if (hasCountPeriodOverride) {
      const validCountDates = await getValidCountDates(buyerGuid);
      const startNorm = String(countPeriodStart).trim().replace(/-/g, "/");
      const endNorm = String(countPeriodEnd).trim().replace(/-/g, "/");
      const startValid =
        validCountDates != null &&
        validCountDates.startDates.includes(startNorm);
      const endValid =
        validCountDates != null && validCountDates.endDates.includes(endNorm);
      const orderValid = startNorm <= endNorm;
      if (validCountDates && startValid && endValid && orderValid) {
        promises.push(
          fetchActualTheoDataByDateRange(buyerGuid, startNorm, endNorm),
        );
      } else {
        promises.push(fetchActualTheoDataForCountDate(buyerGuid));
      }
    } else {
      promises.push(fetchActualTheoDataForCountDate(buyerGuid));
    }
  } else {
    promises.push(Promise.resolve(null));
  }
  if (needPendingOrders) {
    promises.push(
      fetchPendingOrdersByDeliveryDate(
        buyerGuid,
        timezone,
        pendingOrdersPeriod,
      ),
    );
  } else {
    promises.push(Promise.resolve(null));
  }

  const [actualTheoResult, pendingOrdersResult] =
    await Promise.allSettled(promises);

  if (
    needActualTheo &&
    actualTheoResult != null &&
    actualTheoResult.status === "fulfilled" &&
    actualTheoResult.value
  ) {
    const v = actualTheoResult.value as {
      currentFoodCost: number | null;
      inventoryValue: number | null;
      wasteCost: number | null;
      foodCostPercent: number | null;
      theoreticalUsage: number | null;
      theoreticalUsagePercent: number | null;
      varianceItems: VarianceItem[];
      countPeriodStart: string | null;
      countPeriodEnd: string | null;
    };
    if (v.currentFoodCost != null) result.currentFoodCost = v.currentFoodCost;
    if (v.inventoryValue != null) result.inventoryValue = v.inventoryValue;
    if (v.wasteCost != null) result.wasteCost = v.wasteCost;
    if (v.foodCostPercent != null) result.foodCostPercent = v.foodCostPercent;
    if (v.theoreticalUsage != null)
      result.theoreticalUsage = v.theoreticalUsage;
    if (v.theoreticalUsagePercent != null)
      result.theoreticalUsagePercent = v.theoreticalUsagePercent;
    result.countPeriodStart = v.countPeriodStart ?? null;
    result.countPeriodEnd = v.countPeriodEnd ?? null;
    if (Array.isArray(v.varianceItems)) result.varianceItems = v.varianceItems;
  }
  if (
    needPendingOrders &&
    pendingOrdersResult != null &&
    pendingOrdersResult.status === "fulfilled" &&
    pendingOrdersResult.value
  ) {
    const v = pendingOrdersResult.value as {
      count: number | null;
      periodStart: string | null;
      periodEnd: string | null;
    };
    result.pendingOrdersCount = v.count;
    result.pendingOrdersPeriodStart = v.periodStart ?? null;
    result.pendingOrdersPeriodEnd = v.periodEnd ?? null;
  }

  if (requestedMetrics?.length) {
    const filtered: Record<string, unknown> = {};
    const includeCountPeriod = requestedMetrics.some((m) =>
      [
        "currentFoodCost",
        "inventoryValue",
        "wasteCost",
        "varianceItems",
      ].includes(m),
    );
    const includePendingPeriod =
      requestedMetrics.includes("pendingOrdersCount");
    for (const k of requestedMetrics) {
      if (k in result) filtered[k] = (result as unknown as Record<string, unknown>)[k];
    }
    if (includeCountPeriod) {
      filtered.countPeriodStart = result.countPeriodStart ?? null;
      filtered.countPeriodEnd = result.countPeriodEnd ?? null;
    }
    if (includePendingPeriod) {
      filtered.pendingOrdersPeriodStart =
        result.pendingOrdersPeriodStart ?? null;
      filtered.pendingOrdersPeriodEnd = result.pendingOrdersPeriodEnd ?? null;
    }
    return filtered as unknown as InventoryKPIsResult;
  }

  return result;
}

const VALID_DATE_REGEX = /^\d{4}\/\d{2}\/\d{2}$/;
function filterValidDates(arr: unknown): string[] {
  return Array.isArray(arr)
    ? arr.filter(
        (d): d is string => typeof d === "string" && VALID_DATE_REGEX.test(d),
      )
    : [];
}

/**
 * Get valid count dates from GetValidCountDates (StartDateCountsUTC and EndDateCountsUTC).
 * Exported for use by inventory controller (valid-count-dates endpoint).
 */
export async function getValidCountDates(buyerGuid: string): Promise<{
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
 * Fetches GetActualTheoDataByBuyer for the given count start/end and returns
 * current food cost, inventory value, variance, and period for display.
 */
async function fetchActualTheoDataByDateRange(
  buyerGuid: string,
  countStart: string,
  countEnd: string,
): Promise<{
  currentFoodCost: number | null;
  inventoryValue: number | null;
  wasteCost: number | null;
  foodCostPercent: number | null;
  theoreticalUsage: number | null;
  theoreticalUsagePercent: number | null;
  varianceItems: VarianceItem[];
  countPeriodStart: string;
  countPeriodEnd: string;
}> {
  try {
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
        : roundTo2(
            data.ActualTheoDataRows.reduce(
              (s, row) => s + (Number(row.TheoreticalUsageCost) || 0),
              0,
            ),
          );
    const rawTheoPercent = firstCategory?.TheoreticalUsagePercent;
    const theoreticalUsagePercent =
      rawTheoPercent != null ? roundTo2(Number(rawTheoPercent) * 100) : null;
    const inventoryValue = roundTo2(
      data.ActualTheoDataRows.reduce(
        (s, row) => s + (Number(row.ClosingValue) || 0),
        0,
      ),
    );
    const varianceItems: VarianceItem[] = data.ActualTheoDataRows.map((row) => {
      const item: VarianceItem = {
        label: row.ItemName ?? "—",
        varianceCost: roundTo2(Number(row.VarianceValue) ?? 0),
      };
      if (row.COGS != null) item.actualCost = roundTo2(Number(row.COGS));
      if (row.TheoreticalUsageCost != null)
        item.theoreticalCost = roundTo2(Number(row.TheoreticalUsageCost));
      if (row.ActualUsage != null)
        item.actualQuantity = Number(row.ActualUsage);
      if (row.TheoreticalUsage != null)
        item.theoreticalQuantity = Number(row.TheoreticalUsage);
      if (row.UOM != null && String(row.UOM).trim() !== "")
        item.uom = String(row.UOM).trim();
      return item;
    });
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
      countPeriodStart: countStart,
      countPeriodEnd: countEnd,
    };
  }
}

/**
 * Fetches GetActualTheoDataByBuyer for the count period (auto-picked last two valid count dates)
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
  const countEnd: string | null = validCountDates.endDates.at(-1) ?? null;
  if (!countEnd)
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
  const startNotAfterEnd = validCountDates.startDates.filter(
    (d) => d <= countEnd,
  );
  const countStart: string | null =
    startNotAfterEnd.length > 0
      ? ([...startNotAfterEnd].sort((a, b) => (a < b ? -1 : 1)).at(-1) ?? null)
      : null;
  if (!countStart)
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
  const result = await fetchActualTheoDataByDateRange(
    buyerGuid,
    countStart,
    countEnd,
  );
  return {
    ...result,
    countPeriodStart: result.countPeriodStart,
    countPeriodEnd: result.countPeriodEnd,
  };
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

/** Orders with OrderStatusUIName "Received" or containing "cancelled" are not pending. */
function isReceivedOrCancelled(order: { OrderStatusUIName?: string }): boolean {
  const s = String(order.OrderStatusUIName ?? "").toLowerCase();
  if (s === "received") return true;
  if (s.includes("cancelled")) return true;
  return false;
}

/**
 * Fetch pending orders (not yet received, not cancelled) with delivery date in the given period.
 * Uses GetOrdersByDeliveryDate; returns count and period (date-only) for the card.
 * - thisWeek: from this week's Sunday 00:00 through today 23:59
 * - lastWeek: from last week's Sunday 00:00 through last week's Saturday 23:59
 */
async function fetchPendingOrdersByDeliveryDate(
  buyerGuid: string,
  timezone: string,
  period: PendingOrdersPeriod = "thisWeek",
): Promise<{ count: number; periodStart: string; periodEnd: string } | null> {
  try {
    const range =
      period === "lastWeek"
        ? getLastWeekUtcRangeWithPeriod(timezone)
        : getThisWeekThroughTodayUtcRange(timezone);
    const dateTimeFromUTC = formatMarketManDateUtc(range.from);
    const dateTimeToUTC = formatMarketManDateUtc(range.to);

    const data = await marketManRequest<{
      Orders?: Array<{ OrderStatusUIName?: string }>;
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
    return {
      count: pendingCount,
      periodStart: range.periodStart,
      periodEnd: range.periodEnd,
    };
  } catch (err) {
    console.error("[MarketMan] GetOrdersByDeliveryDate error:", err);
  }
  return null;
}

export type OrderTrackerPeriodType =
  | "currentWeek"
  | "lastWeek"
  | "currentMonth"
  | "lastMonth"
  | "currentYear"
  | "lastYear"
  | "today"
  | "tomorrow"
  | "since3DaysAgo"
  | "lastNext30Days"
  | "custom";

export interface OrderTrackerRange {
  dateTimeFromUTC: string;
  dateTimeToUTC: string;
}

export interface OrderTrackerRangesResult {
  api: "delivery" | "sent" | "both";
  ranges: OrderTrackerRange[];
}

/**
 * Resolve order-tracker period type to UTC date ranges in MarketMan format.
 * All dates are interpreted in the store's timezone, then converted to UTC for the API:
 * - Start of range = 00:00:00 in store TZ (e.g. Mountain → 07:00:00 UTC).
 * - End of range = 23:59:59 in store TZ (e.g. Mountain → 06:59:59 UTC next day).
 * For since3DaysAgo uses api "both" (GetOrdersByDeliveryDate and GetOrdersBySentDate with same range, then merge/dedupe).
 * For lastNext30Days returns two ranges (last 30 days, next 30 days).
 */
export function getOrderTrackerRanges(
  periodType: OrderTrackerPeriodType,
  timezone: string,
  periodStart?: string,
  periodEnd?: string,
): OrderTrackerRangesResult {
  const tz = timezone.trim();
  const now = new Date();
  const { y, m, d } = getDatePartsInTz(now, tz);

  if (periodType === "custom" && periodStart && periodEnd) {
    const startMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(periodStart.trim());
    const endMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(periodEnd.trim());
    if (startMatch && endMatch) {
      const sy = Number.parseInt(startMatch[1]!, 10);
      const sm = Number.parseInt(startMatch[2]!, 10) - 1;
      const sd = Number.parseInt(startMatch[3]!, 10);
      const ey = Number.parseInt(endMatch[1]!, 10);
      const em = Number.parseInt(endMatch[2]!, 10) - 1;
      const ed = Number.parseInt(endMatch[3]!, 10);
      // Interpret selected dates in store TZ: start = 00:00:00 local, end = 23:59:59 local → convert to UTC
      const from = getStartOfDayUtc(sy, sm, sd, tz);
      const to = getEndOfDayUtc(ey, em, ed, tz);
      return {
        api: "delivery",
        ranges: [
          {
            dateTimeFromUTC: formatMarketManDateUtc(from),
            dateTimeToUTC: formatMarketManDateUtc(to),
          },
        ],
      };
    }
  }

  switch (periodType) {
    case "today": {
      const { from, to } = getTodayUtcRange(tz);
      return {
        api: "delivery",
        ranges: [
          {
            dateTimeFromUTC: formatMarketManDateUtc(from),
            dateTimeToUTC: formatMarketManDateUtc(to),
          },
        ],
      };
    }
    case "tomorrow": {
      const tomorrow = addDays(y, m, d, 1);
      const from = getStartOfDayUtc(tomorrow.y, tomorrow.m, tomorrow.d, tz);
      const to = getEndOfDayUtc(tomorrow.y, tomorrow.m, tomorrow.d, tz);
      return {
        api: "delivery",
        ranges: [
          {
            dateTimeFromUTC: formatMarketManDateUtc(from),
            dateTimeToUTC: formatMarketManDateUtc(to),
          },
        ],
      };
    }
    case "currentWeek": {
      const { from, to } = getCurrentWeekUtcRange(tz);
      return {
        api: "delivery",
        ranges: [
          {
            dateTimeFromUTC: formatMarketManDateUtc(from),
            dateTimeToUTC: formatMarketManDateUtc(to),
          },
        ],
      };
    }
    case "lastWeek": {
      const { from, to } = getLastWeekUtcRange(tz);
      return {
        api: "delivery",
        ranges: [
          {
            dateTimeFromUTC: formatMarketManDateUtc(from),
            dateTimeToUTC: formatMarketManDateUtc(to),
          },
        ],
      };
    }
    case "currentMonth": {
      const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
      const from = getStartOfDayUtc(y, m, 1, tz);
      const to = getEndOfDayUtc(y, m, lastDayOfMonth, tz);
      return {
        api: "delivery",
        ranges: [
          {
            dateTimeFromUTC: formatMarketManDateUtc(from),
            dateTimeToUTC: formatMarketManDateUtc(to),
          },
        ],
      };
    }
    case "lastMonth": {
      const lastMonth = new Date(y, m - 1, 1);
      const ly = lastMonth.getFullYear();
      const lm = lastMonth.getMonth();
      const lastDay = new Date(ly, lm + 1, 0).getDate();
      const from = getStartOfDayUtc(ly, lm, 1, tz);
      const to = getEndOfDayUtc(ly, lm, lastDay, tz);
      return {
        api: "delivery",
        ranges: [
          {
            dateTimeFromUTC: formatMarketManDateUtc(from),
            dateTimeToUTC: formatMarketManDateUtc(to),
          },
        ],
      };
    }
    case "currentYear": {
      const from = getStartOfDayUtc(y, 0, 1, tz);
      const to = getEndOfDayUtc(y, 11, 31, tz);
      return {
        api: "delivery",
        ranges: [
          {
            dateTimeFromUTC: formatMarketManDateUtc(from),
            dateTimeToUTC: formatMarketManDateUtc(to),
          },
        ],
      };
    }
    case "lastYear": {
      const from = getStartOfDayUtc(y - 1, 0, 1, tz);
      const to = getEndOfDayUtc(y - 1, 11, 31, tz);
      return {
        api: "delivery",
        ranges: [
          {
            dateTimeFromUTC: formatMarketManDateUtc(from),
            dateTimeToUTC: formatMarketManDateUtc(to),
          },
        ],
      };
    }
    case "since3DaysAgo": {
      const threeDaysAgo = addDays(y, m, d, -3);
      const from = getStartOfDayUtc(
        threeDaysAgo.y,
        threeDaysAgo.m,
        threeDaysAgo.d,
        tz,
      );
      const to = getEndOfDayUtc(y, m, d, tz);
      return {
        api: "both",
        ranges: [
          {
            dateTimeFromUTC: formatMarketManDateUtc(from),
            dateTimeToUTC: formatMarketManDateUtc(to),
          },
        ],
      };
    }
    case "lastNext30Days": {
      const todayStart = getStartOfDayUtc(y, m, d, tz);
      const last30Start = addDays(y, m, d, -30);
      const next30End = addDays(y, m, d, 30);
      return {
        api: "delivery",
        ranges: [
          {
            dateTimeFromUTC: formatMarketManDateUtc(
              getStartOfDayUtc(last30Start.y, last30Start.m, last30Start.d, tz),
            ),
            dateTimeToUTC: formatMarketManDateUtc(
              new Date(todayStart.getTime() - 1),
            ),
          },
          {
            dateTimeFromUTC: formatMarketManDateUtc(todayStart),
            dateTimeToUTC: formatMarketManDateUtc(
              getEndOfDayUtc(next30End.y, next30End.m, next30End.d, tz),
            ),
          },
        ],
      };
    }
    default:
      // currentMonth as default
      return getOrderTrackerRanges("currentMonth", tz);
  }
}

/** Merge order arrays and deduplicate by OrderNumber. */
export function mergeOrdersByOrderNumber(
  ordersArrays: MarketManOrder[][],
): MarketManOrder[] {
  const byNumber = new Map<string, MarketManOrder>();
  for (const arr of ordersArrays) {
    for (const order of arr) {
      const num = String(order.OrderNumber ?? "").trim();
      if (num && !byNumber.has(num)) byNumber.set(num, order);
    }
  }
  return Array.from(byNumber.values());
}

/**
 * Fetch orders by delivery date range. Dates in MarketMan format yyyy/MM/dd HH:mm:ss UTC.
 */
export async function getOrdersByDeliveryDate(
  buyerGuid: string,
  dateTimeFromUTC: string,
  dateTimeToUTC: string,
): Promise<MarketManOrder[]> {
  const data = await marketManRequest<GetOrdersByDeliveryDateResponse>(
    "/buyers/orders/GetOrdersByDeliveryDate",
    {
      DateTimeFromUTC: dateTimeFromUTC,
      DateTimeToUTC: dateTimeToUTC,
    },
    buyerGuid,
  );
  return Array.isArray(data.Orders) ? data.Orders : [];
}

/**
 * Fetch orders by sent date range. Dates in MarketMan format yyyy/MM/dd HH:mm:ss UTC.
 * Sends IncludeReceivedOrders: true so the API returns received orders as well as pending.
 */
export async function getOrdersBySentDate(
  buyerGuid: string,
  dateTimeFromUTC: string,
  dateTimeToUTC: string,
): Promise<MarketManOrder[]> {
  const data = await marketManRequest<GetOrdersBySentDateResponse>(
    "/buyers/orders/GetOrdersBySentDate",
    {
      DateTimeFromUTC: dateTimeFromUTC,
      DateTimeToUTC: dateTimeToUTC,
      IncludeReceivedOrders: true,
    },
    buyerGuid,
  );
  return Array.isArray(data.Orders) ? data.Orders : [];
}

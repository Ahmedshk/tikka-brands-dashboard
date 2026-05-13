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
import {
  buildActualTheoPromise,
  mergeActualTheoIntoResult,
  mergePendingOrdersIntoResult,
  filterResultByRequestedMetrics,
  parseActualTheoApiResponse,
  type ActualTheoFetchers,
  type ActualTheoValue,
} from "../utils/marketmanKpiHelpers.js";
import mongoose from "mongoose";
import { MarketManActualTheoSnapshotModel } from "../models/marketmanActualTheoSnapshot.model.js";
import { MarketManValidCountDatesModel } from "../models/marketmanValidCountDates.model.js";
import { MarketManOrderCacheModel } from "../models/marketmanOrderCache.model.js";
import {
  marketManLazyActualTheoSyncDateKey,
  marketManUtcDatePrefix,
  parseMarketManUtcToDate,
} from "../utils/marketmanUtcDateParse.util.js";
import { isExternalDataCacheReadEnabled } from "../config/externalDataCache.config.js";
import { upsertMarketManActualTheoSnapshot } from "./integrationCacheWrite.service.js";

/** MarketMan JSON may encode IDs / product codes as string or number. */
export type MarketManStringOrNumberOrNull = string | number | null;

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

/** Row from POST /buyers/orders/GetCatalogItems (subset used for webhook enrichment). */
export interface MarketManCatalogItem {
  Name?: string;
  PackQty?: number | null;
  PacksPerCase?: number | null;
  UOMName?: string;
  UOMID?: number | null;
  ProductCode?: MarketManStringOrNumberOrNull;
  TaxLevelID?: number | null;
  TaxValue?: number | null;
  CatalogItemCode?: number | null;
}

export interface GetCatalogItemsResponse {
  CatalogItems?: MarketManCatalogItem[];
  IsSuccess?: boolean;
  ErrorMessage?: string | null;
  ErrorCode?: string | null;
}

export interface MarketManInventoryItemPurchaseItem {
  Name?: string | null;
  SupplierName?: string | null;
  VendorName?: string | null;
  PackQty?: number | null;
  PacksPerCase?: number | null;
  UOMName?: string | null;
  UOMID?: number | null;
  ProductCode?: MarketManStringOrNumberOrNull;
  Price?: number | null;
  MinOrderQty?: number | null;
  PriceType?: string | null;
  Ratio?: number | null;
  VendorGuid?: string | null;
  CatalogItemCode?: number | null;
  TaxLevelID?: number | null;
  TaxValue?: number | null;
  PriceWithVat?: number | null;
  ScanBarcode?: string | null;
  IsMainPurchaseOption?: boolean | null;
  DeletedFromSupplier?: boolean | null;
  IsForOrdering?: boolean | null;
}

export interface MarketManInventoryItem {
  ID?: MarketManStringOrNumberOrNull;
  Name?: string | null;
  AboutTheItem?: string | null;
  UpdateDate?: string | null;
  CategoryID?: number | null;
  CategoryName?: string | null;
  UOMName?: string | null;
  UOMID?: number | null;
  ReportingUOM?: string | null;
  MinOnHand?: number | null;
  ParLevel?: number | null;
  MinOrderQty?: number | null;
  MaxOrderQty?: number | null;
  DateRangeType?: string | null;
  StorageIDs?: number[] | null;
  StorageNames?: string[] | null;
  OnHand?: number | null;
  BOMPrice?: number | null;
  DebitAccountName?: string | null;
  PurchaseItems?: MarketManInventoryItemPurchaseItem[] | null;
  IsDeleted?: boolean | null;
  CountDefOptions?: unknown;
}

export interface GetInventoryItemsResponse {
  Items?: MarketManInventoryItem[];
  MaxTakeAllowed?: number | null;
  Page?: { Skip?: number | null; Take?: number | null; Total?: number | null } | null;
  IsSuccess?: boolean;
  ErrorMessage?: string | null;
  ErrorCode?: string | null;
  RequestID?: string | null;
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
export function getTodayUtcRange(timezone: string): { from: Date; to: Date } {
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
  cacheLocationMongoId?: string | null,
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

  if (!buyerGuid?.trim()) return result;

  const needActualTheo =
    !requestedMetrics?.length ||
    requestedMetrics.some((m) =>
      (ACTUAL_THEO_METRICS as readonly string[]).includes(m),
    );
  const needPendingOrders =
    !requestedMetrics?.length ||
    requestedMetrics.includes("pendingOrdersCount");

  await getMarketManToken();

  const useCache =
    Boolean(cacheLocationMongoId?.trim()) &&
    isExternalDataCacheReadEnabled();
  const actualTheoFetchers: ActualTheoFetchers = useCache
    ? createMarketManLazyActualTheoFetchers(cacheLocationMongoId!.trim())
    : {
        getValidCountDates,
        fetchActualTheoDataByDateRange,
      };

  const actualTheoPromise = needActualTheo
    ? buildActualTheoPromise(
        buyerGuid,
        countPeriodStart,
        countPeriodEnd,
        actualTheoFetchers,
      )
    : Promise.resolve(null);
  const pendingOrdersPromise = (() => {
    if (!needPendingOrders) return Promise.resolve(null);
    if (useCache && cacheLocationMongoId) {
      return fetchPendingOrdersDeliveryFromCache(
        cacheLocationMongoId.trim(),
        buyerGuid,
        timezone,
        pendingOrdersPeriod,
      );
    }
    return fetchPendingOrdersByDeliveryDate(
      buyerGuid,
      timezone,
      pendingOrdersPeriod,
    );
  })();

  const [actualTheoResult, pendingOrdersResult] = await Promise.allSettled([
    actualTheoPromise,
    pendingOrdersPromise,
  ]);

  if (
    needActualTheo &&
    actualTheoResult.status === "fulfilled" &&
    actualTheoResult.value != null
  ) {
    mergeActualTheoIntoResult(result, actualTheoResult.value);
  }
  if (
    needPendingOrders &&
    pendingOrdersResult.status === "fulfilled" &&
    pendingOrdersResult.value != null
  ) {
    mergePendingOrdersIntoResult(result, pendingOrdersResult.value);
  }

  if (requestedMetrics?.length) {
    return filterResultByRequestedMetrics(
      result,
      requestedMetrics,
    ) as unknown as InventoryKPIsResult;
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

/** Mongo only when cache reads are enabled; no live MarketMan call for this saved model. */
export async function getValidCountDatesWithCacheFallback(
  locationMongoId: string | undefined,
  buyerGuid: string,
): Promise<{ startDates: string[]; endDates: string[] } | null> {
  if (locationMongoId?.trim() && isExternalDataCacheReadEnabled()) {
    return getValidCountDatesFromMongo(locationMongoId.trim(), buyerGuid);
  }
  return getValidCountDates(buyerGuid);
}

async function getValidCountDatesFromMongo(
  locationMongoId: string,
  buyerGuid: string,
): Promise<{ startDates: string[]; endDates: string[] } | null> {
  const doc = await MarketManValidCountDatesModel.findOne({
    locationId: new mongoose.Types.ObjectId(locationMongoId),
    buyerGuid,
  })
    .sort({ fetchedAt: -1 })
    .lean()
    .exec();
  if (!doc?.startDates?.length || !doc?.endDates?.length) return null;
  return { startDates: doc.startDates, endDates: doc.endDates };
}

async function findActualTheoSnapshotForCountPeriod(
  locationMongoId: string,
  buyerGuid: string,
  countStart: string,
  countEnd: string,
): Promise<{ raw: Record<string, unknown> } | null> {
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const startNorm = marketManUtcDatePrefix(
    String(countStart).trim().replaceAll("-", "/"),
  );
  const endNorm = marketManUtcDatePrefix(
    String(countEnd).trim().replaceAll("-", "/"),
  );
  const candidates = await MarketManActualTheoSnapshotModel.find({
    locationId: oid,
    buyerGuid,
  })
    .sort({ fetchedAt: -1 })
    .limit(80)
    .lean()
    .exec();
  for (const c of candidates) {
    if (
      marketManUtcDatePrefix(c.startDateUTC) === startNorm &&
      marketManUtcDatePrefix(c.endDateUTC) === endNorm
    ) {
      return { raw: c.raw };
    }
  }
  return null;
}

/**
 * Inventory-food-cost path: read Mongo for this count period if present; otherwise
 * call MarketMan, persist raw response, then parse. (Waste cost on that page comes
 * from this same API.) No TTL on snapshots yet.
 */
function createMarketManLazyActualTheoFetchers(
  locationMongoId: string,
): ActualTheoFetchers {
  return {
    getValidCountDates: async (bg) =>
      getValidCountDatesFromMongo(locationMongoId, bg),
    fetchActualTheoDataByDateRange: async (bg, start, end) => {
      const cached = await findActualTheoSnapshotForCountPeriod(
        locationMongoId,
        bg,
        start,
        end,
      );
      if (cached?.raw) {
        return parseActualTheoApiResponse(cached.raw, start, end);
      }
      const raw = await fetchActualTheoRawByDateRange(bg, start, end);
      if (raw) {
        await upsertMarketManActualTheoSnapshot(
          locationMongoId,
          bg,
          marketManLazyActualTheoSyncDateKey(start, end),
          start,
          end,
          raw,
        );
      }
      return parseActualTheoApiResponse(raw, start, end);
    },
  };
}

async function fetchActualTheoRawByDateRange(
  buyerGuid: string,
  countStart: string,
  countEnd: string,
): Promise<Record<string, unknown> | null> {
  try {
    return await marketManRequest<Record<string, unknown>>(
      "/buyers/inventory/GetActualTheoDataByBuyer",
      {
        StartDateUTC: countStart,
        EndDateUTC: countEnd,
      },
      buyerGuid,
    );
  } catch (err) {
    console.error("[MarketMan] GetActualTheoDataByBuyer error:", err);
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
): Promise<ActualTheoValue> {
  const raw = await fetchActualTheoRawByDateRange(
    buyerGuid,
    countStart,
    countEnd,
  );
  if (!raw) {
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
  return parseActualTheoApiResponse(raw, countStart, countEnd);
}

/** Format date-only yyyy/MM/dd from timezone-local (y, m, d) with m 0-based. */
function formatDateOnly(y: number, m: number, d: number): string {
  return `${y}/${String(m + 1).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

/** Orders with OrderStatusUIName "Received" or containing "cancelled" are not pending. */
export function marketManOrderIsTerminalForPending(order: {
  OrderStatusUIName?: string;
}): boolean {
  const s = String(order.OrderStatusUIName ?? "").toLowerCase();
  if (s === "received") return true;
  if (s.includes("cancelled")) return true;
  return false;
}

/** UTC window and MarketMan query params for pending-orders card (this week / last week). */
export function getPendingOrdersDeliveryUtcWindow(
  period: PendingOrdersPeriod,
  timezone: string,
): {
  dateTimeFromUTC: string;
  dateTimeToUTC: string;
  periodStart: string;
  periodEnd: string;
} {
  const range =
    period === "lastWeek"
      ? getLastWeekUtcRangeWithPeriod(timezone)
      : getThisWeekThroughTodayUtcRange(timezone);
  return {
    dateTimeFromUTC: formatMarketManDateUtc(range.from),
    dateTimeToUTC: formatMarketManDateUtc(range.to),
    periodStart: range.periodStart,
    periodEnd: range.periodEnd,
  };
}

async function fetchPendingOrdersDeliveryFromCache(
  locationMongoId: string,
  buyerGuid: string,
  timezone: string,
  period: PendingOrdersPeriod,
): Promise<{ count: number; periodStart: string; periodEnd: string } | null> {
  const win = getPendingOrdersDeliveryUtcWindow(period, timezone);
  const fromMs = parseMarketManUtcToDate(win.dateTimeFromUTC)?.getTime();
  const toMs = parseMarketManUtcToDate(win.dateTimeToUTC)?.getTime();
  if (fromMs == null || toMs == null) return null;

  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const docs = await MarketManOrderCacheModel.find({
    locationId: oid,
    buyerGuid,
    apiKind: "delivery",
    businessDateAt: {
      $gte: new Date(fromMs),
      $lte: new Date(toMs),
    },
  })
    .lean()
    .exec();

  let pending = 0;
  for (const d of docs) {
    const o = d.raw as MarketManOrder;
    if (!marketManOrderIsTerminalForPending(o)) pending += 1;
  }
  return {
    count: pending,
    periodStart: win.periodStart,
    periodEnd: win.periodEnd,
  };
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
    const win = getPendingOrdersDeliveryUtcWindow(period, timezone);
    const data = await marketManRequest<{
      Orders?: Array<{ OrderStatusUIName?: string }>;
    }>(
      "/buyers/orders/GetOrdersByDeliveryDate",
      {
        DateTimeFromUTC: win.dateTimeFromUTC,
        DateTimeToUTC: win.dateTimeToUTC,
      },
      buyerGuid,
    );
    const orders = Array.isArray(data.Orders) ? data.Orders : [];
    const pendingCount = orders.filter(
      (o) => !marketManOrderIsTerminalForPending(o),
    ).length;
    return {
      count: pendingCount,
      periodStart: win.periodStart,
      periodEnd: win.periodEnd,
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

/**
 * Buyer + vendor catalog (SKU / ProductCode mapping) for order line enrichment.
 */
export async function getMarketManCatalogItems(
  buyerGuid: string,
  vendorGuid: string,
): Promise<MarketManCatalogItem[]> {
  const data = await marketManRequest<GetCatalogItemsResponse>(
    "/buyers/orders/GetCatalogItems",
    { VendorGuid: vendorGuid.trim() },
    buyerGuid.trim(),
  );
  if (!data.IsSuccess) {
    throw new Error(
      data.ErrorMessage?.trim() || "GetCatalogItems failed",
    );
  }
  return Array.isArray(data.CatalogItems) ? data.CatalogItems : [];
}

export async function getInventoryItems(buyerGuid: string): Promise<MarketManInventoryItem[]> {
  const data = await marketManRequest<GetInventoryItemsResponse>(
    "/buyers/inventory/GetInventoryItems",
    {},
    buyerGuid.trim(),
  );
  if (data.IsSuccess === false) {
    throw new Error(
      data.ErrorMessage?.trim() || "GetInventoryItems failed",
    );
  }
  return Array.isArray(data.Items) ? data.Items : [];
}

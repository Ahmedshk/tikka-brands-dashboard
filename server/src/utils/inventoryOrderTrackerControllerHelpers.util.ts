import { isExternalDataCacheReadEnabled } from "../config/externalDataCache.config.js";
import {
  getOrderTrackerRanges,
  getOrdersByDeliveryDate,
  getOrdersBySentDate,
  mergeOrdersByOrderNumber,
  type MarketManOrder,
  type OrderTrackerPeriodType,
} from "../services/marketman.service.js";
import { loadMarketManOrdersFromOrderCacheByKindInRange } from "./inventoryOrderCacheRead.util.js";
import type { OrderTrackerOrderDto } from "../types/inventory.types.js";
import { formatOrderDateInTz, parseMarketManUtc } from "./marketManOrderDisplay.util.js";

type OrderTrackerQuery = {
  locationId: string;
  periodType: OrderTrackerPeriodType;
  periodStart?: string;
  periodEnd?: string;
};

type OrderApiType = "sent" | "delivery" | "both";

export type OrderTrackerRowsResult =
  | { kind: "bad_request"; message: string }
  | { kind: "ok"; rows: OrderTrackerOrderDto[] };

export function parseOrderTrackerQuery(req: {
  query: Record<string, unknown>;
}): OrderTrackerQuery {
  const locationId = typeof req.query.locationId === "string" ? req.query.locationId : "";
  const periodType = (req.query.periodType as OrderTrackerPeriodType) || "currentMonth";
  const periodStart =
    typeof req.query.periodStart === "string" ? req.query.periodStart : undefined;
  const periodEnd =
    typeof req.query.periodEnd === "string" ? req.query.periodEnd : undefined;
  return {
    locationId,
    periodType,
    ...(periodStart == null ? {} : { periodStart }),
    ...(periodEnd == null ? {} : { periodEnd }),
  };
}

function sortRowsByUtcField(rows: OrderTrackerOrderDto[], dateField: string): void {
  rows.sort((a, b) => {
    const da = parseMarketManUtc((a.orderDetails as Record<string, string | undefined>)[dateField]);
    const db = parseMarketManUtc((b.orderDetails as Record<string, string | undefined>)[dateField]);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db.getTime() - da.getTime();
  });
}

function mapOrdersToRows(args: {
  orders: MarketManOrder[];
  timezone: string;
  apiType: OrderApiType;
}): OrderTrackerOrderDto[] {
  const { orders, timezone, apiType } = args;
  const dateField = apiType === "sent" ? "SentDateUTC" : "DeliveryDateUTC";

  const rows: OrderTrackerOrderDto[] = orders.map((order) => {
    const utcDate = (order as Record<string, string | undefined>)[dateField];
    const sentDateUtc = (order as Record<string, string | undefined>).SentDateUTC;
    return {
      poNumber: String(order.OrderNumber ?? "").trim() || "—",
      supplier: String(order.VendorName ?? "").trim() || "—",
      deliveryDate: formatOrderDateInTz(utcDate, timezone),
      sentDate: formatOrderDateInTz(sentDateUtc, timezone),
      status: String(order.OrderStatusUIName ?? "").trim() || "—",
      orderDetails: order,
    };
  });

  sortRowsByUtcField(rows, dateField);
  return rows;
}

async function fetchOrdersFromCache(args: {
  locationId: string;
  buyerGuid: string;
  apiType: OrderApiType;
  ranges: Array<{ dateTimeFromUTC: string; dateTimeToUTC: string }>;
}): Promise<OrderTrackerRowsResult | { kind: "ok_orders"; orders: MarketManOrder[] }> {
  const { locationId, buyerGuid, apiType, ranges } = args;

  if (apiType === "both") {
    const range = ranges[0];
    if (!range) {
      return { kind: "bad_request", message: "Invalid order tracker period or range." };
    }
    const [allDelivery, allSent] = await Promise.all([
      loadMarketManOrdersFromOrderCacheByKindInRange(locationId, buyerGuid, "delivery", range),
      loadMarketManOrdersFromOrderCacheByKindInRange(locationId, buyerGuid, "sent", range),
    ]);
    return { kind: "ok_orders", orders: mergeOrdersByOrderNumber([allDelivery, allSent]) };
  }

  const kind = apiType === "sent" ? "sent" : "delivery";
  const pages = await Promise.all(
    ranges.map((r) => loadMarketManOrdersFromOrderCacheByKindInRange(locationId, buyerGuid, kind, r)),
  );
  const orders = pages.length > 1 ? mergeOrdersByOrderNumber(pages) : pages[0] ?? [];
  return { kind: "ok_orders", orders };
}

async function fetchOrdersFromApi(args: {
  buyerGuid: string;
  apiType: OrderApiType;
  ranges: Array<{ dateTimeFromUTC: string; dateTimeToUTC: string }>;
}): Promise<OrderTrackerRowsResult | { kind: "ok_orders"; orders: MarketManOrder[] }> {
  const { buyerGuid, apiType, ranges } = args;

  if (apiType === "both") {
    const range = ranges[0];
    if (!range) {
      return { kind: "bad_request", message: "Invalid order tracker period or range." };
    }
    const [byDelivery, bySent] = await Promise.all([
      getOrdersByDeliveryDate(buyerGuid, range.dateTimeFromUTC, range.dateTimeToUTC),
      getOrdersBySentDate(buyerGuid, range.dateTimeFromUTC, range.dateTimeToUTC),
    ]);
    return { kind: "ok_orders", orders: mergeOrdersByOrderNumber([byDelivery, bySent]) };
  }

  const fetchFn = apiType === "sent" ? getOrdersBySentDate : getOrdersByDeliveryDate;
  const pages = await Promise.all(ranges.map((r) => fetchFn(buyerGuid, r.dateTimeFromUTC, r.dateTimeToUTC)));
  const orders = pages.length > 1 ? mergeOrdersByOrderNumber(pages) : pages[0] ?? [];
  return { kind: "ok_orders", orders };
}

export async function getOrderTrackerRows(args: {
  locationId: string;
  buyerGuid: string;
  timezone: string;
  periodType: OrderTrackerPeriodType;
  periodStart?: string;
  periodEnd?: string;
}): Promise<OrderTrackerRowsResult> {
  const { locationId, buyerGuid, timezone, periodType, periodStart, periodEnd } = args;

  const { api: apiType, ranges } = getOrderTrackerRanges(periodType, timezone, periodStart, periodEnd);
  const useOrderCache = isExternalDataCacheReadEnabled() && Boolean(locationId.trim());

  const ordersResult = useOrderCache
    ? await fetchOrdersFromCache({ locationId, buyerGuid, apiType, ranges })
    : await fetchOrdersFromApi({ buyerGuid, apiType, ranges });

  if (ordersResult.kind === "bad_request") return ordersResult;
  if (ordersResult.kind === "ok") return ordersResult;

  return {
    kind: "ok",
    rows: mapOrdersToRows({ orders: ordersResult.orders, timezone, apiType }),
  };
}


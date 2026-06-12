import { isExternalDataCacheReadEnabled } from "../config/externalDataCache.config.js";
import { formatMarketManDateUtc } from "../services/marketman.client.js";
import type { MarketManOrder, OrderTrackerRange } from "../services/marketman.service.js";
import { getOrdersByDeliveryDate } from "../services/marketman.service.js";
import type { DeliveryOverdueOrderEmailRow } from "./alertEvaluationSendAlertHelpers.util.js";
import { loadMarketManOrdersFromOrderCacheByKindInRange } from "./inventoryOrderCacheRead.util.js";
import { formatOrderDateInTz, parseMarketManUtc } from "./marketManOrderDisplay.util.js";
import { parseMarketManUtcToDate } from "./marketmanUtcDateParse.util.js";
import { logger } from "./logger.util.js";
import { getTodayInTimezone } from "./timezone.util.js";

function deliveryUtcToLocalDateKey(utcDelivery: string | undefined, timezone: string): string | null {
  const d = parseMarketManUtcToDate(utcDelivery);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.trim(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`;
}

function isOrderReceivedStatus(status: string): boolean {
  const t = status.trim().toLowerCase();
  return t.includes("received");
}

function isOrderCancelledStatus(status: string): boolean {
  const t = status.trim().toLowerCase();
  return t.includes("cancel");
}

function buildAlertOrderRange(): OrderTrackerRange {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 120);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date();
  to.setUTCDate(to.getUTCDate() + 14);
  to.setUTCHours(23, 59, 59, 0);
  return {
    dateTimeFromUTC: formatMarketManDateUtc(from),
    dateTimeToUTC: formatMarketManDateUtc(to),
  };
}

export type OverdueDeliveryOrderRow = DeliveryOverdueOrderEmailRow & {
  orderNumber: string;
};

export async function listOverdueDeliveryOrdersNotReceived(
  locationId: string,
  buyerGuid: string,
  timezone: string,
): Promise<OverdueDeliveryOrderRow[]> {
  const range = buildAlertOrderRange();
  const useCache = isExternalDataCacheReadEnabled() && Boolean(locationId.trim());
  let orders: MarketManOrder[];
  try {
    if (useCache) {
      orders = await loadMarketManOrdersFromOrderCacheByKindInRange(
        locationId,
        buyerGuid,
        "delivery",
        range,
      );
    } else {
      orders = await getOrdersByDeliveryDate(
        buyerGuid,
        range.dateTimeFromUTC,
        range.dateTimeToUTC,
      );
    }
  } catch (err) {
    logger.warn("[Alerts] MarketMan orders fetch failed", { locationId, err });
    return [];
  }

  const todayKey = getTodayInTimezone(timezone);
  const overdueRaw: MarketManOrder[] = [];
  for (const o of orders) {
    const status = String(o.OrderStatusUIName ?? "").trim();
    if (!status || isOrderCancelledStatus(status)) continue;
    if (isOrderReceivedStatus(status)) continue;
    const dk = deliveryUtcToLocalDateKey(o.DeliveryDateUTC, timezone);
    if (dk != null && dk < todayKey) overdueRaw.push(o);
  }

  overdueRaw.sort((a, b) => {
    const da = parseMarketManUtc(a.DeliveryDateUTC);
    const db = parseMarketManUtc(b.DeliveryDateUTC);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db.getTime() - da.getTime();
  });

  return overdueRaw.map((o) => {
    const orderNumber = String(o.OrderNumber ?? "").trim();
    return {
      orderNumber: orderNumber || "—",
      poNumber: orderNumber || "—",
      supplier: String(o.VendorName ?? "").trim() || "—",
      deliveryDate: formatOrderDateInTz(o.DeliveryDateUTC, timezone),
      status: String(o.OrderStatusUIName ?? "").trim() || "—",
    };
  });
}

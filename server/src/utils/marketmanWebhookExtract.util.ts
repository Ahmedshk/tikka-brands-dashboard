import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";

function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickRecord(
  obj: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | null {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  }
  return null;
}

export function marketManOrderNumberStringFromRaw(
  o: Record<string, unknown>,
): string {
  const n = o.OrderNumber;
  if (n == null) return "";
  if (
    typeof n === "string" ||
    typeof n === "number" ||
    typeof n === "bigint"
  ) {
    return String(n).trim();
  }
  return "";
}

function orderHasOrderNumber(o: Record<string, unknown>): boolean {
  return marketManOrderNumberStringFromRaw(o).length > 0;
}

/**
 * Hood-style: `HoodEventID` + `Data` (order fields on `Data`), optionally nested under `Event`.
 */
function tryExtractHoodStyleOrder(root: Record<string, unknown>): {
  order: Record<string, unknown>;
  eventName: string;
  buyerGuid: string | null;
} | null {
  const data = pickRecord(root, ["Data", "data"]);
  if (!data || !orderHasOrderNumber(data)) return null;
  const hoodId = pickString(root, ["HoodEventID", "hoodEventId"]);
  const eventName = hoodId ? `HoodEvent:${hoodId}` : "HoodEvent";
  const buyerGuid = pickString(data, [
    "BuyerGuid",
    "buyerGuid",
    "BuyerGUID",
    "buyer_guid",
  ]);
  return { order: data, eventName, buyerGuid };
}

/**
 * Best-effort extraction: HoodEventID + Data, Event wrapper, then legacy Order / Payload / Data / body.
 */
export function extractMarketManWebhookPayload(body: Record<string, unknown>): {
  eventName: string | null;
  buyerGuid: string | null;
  order: Record<string, unknown> | null;
  explicitApiKind: MarketManOrderApiKind | null;
} {
  let eventName = pickString(body, [
    "EventType",
    "eventType",
    "Type",
    "type",
    "Name",
    "name",
  ]);

  let buyerGuid = pickString(body, [
    "BuyerGuid",
    "buyerGuid",
    "BuyerGUID",
    "buyer_guid",
    "BuyerId",
    "buyerId",
  ]);

  let order: Record<string, unknown> | null = null;

  const eventObj = pickRecord(body, ["Event", "event"]);
  if (eventObj) {
    const hood = tryExtractHoodStyleOrder(eventObj);
    if (hood) {
      order = hood.order;
      eventName = hood.eventName;
      buyerGuid = hood.buyerGuid ?? buyerGuid;
    }
  }

  if (!order) {
    const hood = tryExtractHoodStyleOrder(body);
    if (hood) {
      order = hood.order;
      eventName = hood.eventName;
      buyerGuid = hood.buyerGuid ?? buyerGuid;
    }
  }

  if (!order) {
    let o = pickRecord(body, ["Order", "order", "Payload", "payload", "Data", "data"]);
    if (o) {
      const nested = pickRecord(o, ["Order", "order"]);
      if (nested) o = nested;
    }
    order = o ?? null;
  }

  if (order && !buyerGuid) {
    buyerGuid = pickString(order, [
      "BuyerGuid",
      "buyerGuid",
      "BuyerGUID",
      "buyer_guid",
    ]);
  }

  if (!order && orderHasOrderNumber(body)) {
    order = body;
  }

  if (order && !orderHasOrderNumber(order)) {
    order = null;
  }

  const kindRaw =
    pickString(body, ["ApiKind", "apiKind", "OrderApiKind", "orderApiKind"]) ??
    (order
      ? pickString(order, ["ApiKind", "apiKind", "OrderApiKind", "orderApiKind"])
      : null);

  let explicitApiKind: MarketManOrderApiKind | null = null;
  if (kindRaw) {
    const u = kindRaw.toLowerCase();
    if (u === "sent" || u === "delivery") explicitApiKind = u;
  }

  return { eventName, buyerGuid, order, explicitApiKind };
}

export function inferMarketManOrderApiKindFromOrderRaw(
  order: Record<string, unknown>,
): MarketManOrderApiKind {
  const del =
    typeof order.DeliveryDateUTC === "string" && order.DeliveryDateUTC.trim().length > 0;
  const sent =
    typeof order.SentDateUTC === "string" && order.SentDateUTC.trim().length > 0;
  if (del) return "delivery";
  if (sent) return "sent";
  return "delivery";
}

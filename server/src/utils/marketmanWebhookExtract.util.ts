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

type WebhookExtractionScratch = {
  eventName: string | null;
  buyerGuid: string | null;
  order: Record<string, unknown> | null;
};

function applyHoodExtraction(
  state: WebhookExtractionScratch,
  hood: NonNullable<ReturnType<typeof tryExtractHoodStyleOrder>>,
): void {
  state.order = hood.order;
  state.eventName = hood.eventName;
  state.buyerGuid = hood.buyerGuid ?? state.buyerGuid;
}

function tryResolveOrderFromEventWrapper(
  state: WebhookExtractionScratch,
  body: Record<string, unknown>,
): void {
  const eventObj = pickRecord(body, ["Event", "event"]);
  if (!eventObj) return;
  const hood = tryExtractHoodStyleOrder(eventObj);
  if (!hood) return;
  applyHoodExtraction(state, hood);
}

function tryResolveHoodFromBodyRoot(
  state: WebhookExtractionScratch,
  body: Record<string, unknown>,
): void {
  if (state.order != null) return;
  const hood = tryExtractHoodStyleOrder(body);
  if (!hood) return;
  applyHoodExtraction(state, hood);
}

function tryResolveLegacyOrderRecord(body: Record<string, unknown>): Record<string, unknown> | null {
  let o = pickRecord(body, ["Order", "order", "Payload", "payload", "Data", "data"]);
  if (!o) return null;
  const nested = pickRecord(o, ["Order", "order"]);
  return nested ?? o;
}

function backfillBuyerGuidFromOrderRecord(
  order: Record<string, unknown> | null,
  buyerGuid: string | null,
): string | null {
  if (order == null || buyerGuid != null) return buyerGuid;
  return pickString(order, ["BuyerGuid", "buyerGuid", "BuyerGUID", "buyer_guid"]);
}

function finalizeOrderRecord(
  order: Record<string, unknown> | null,
  body: Record<string, unknown>,
): Record<string, unknown> | null {
  let o = order;
  if (o == null && orderHasOrderNumber(body)) o = body;
  if (o != null && !orderHasOrderNumber(o)) return null;
  return o;
}

function parseExplicitApiKindFromPayload(
  body: Record<string, unknown>,
  order: Record<string, unknown> | null,
): MarketManOrderApiKind | null {
  const kindRaw =
    pickString(body, ["ApiKind", "apiKind", "OrderApiKind", "orderApiKind"]) ??
    (order == null
      ? null
      : pickString(order, ["ApiKind", "apiKind", "OrderApiKind", "orderApiKind"]));
  if (kindRaw == null) return null;
  const u = kindRaw.toLowerCase();
  if (u === "sent" || u === "delivery") return u;
  return null;
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
  const state: WebhookExtractionScratch = {
    eventName: pickString(body, [
      "EventType",
      "eventType",
      "Type",
      "type",
      "Name",
      "name",
    ]),
    buyerGuid: pickString(body, [
      "BuyerGuid",
      "buyerGuid",
      "BuyerGUID",
      "buyer_guid",
      "BuyerId",
      "buyerId",
    ]),
    order: null,
  };

  tryResolveOrderFromEventWrapper(state, body);
  tryResolveHoodFromBodyRoot(state, body);
  state.order ??= tryResolveLegacyOrderRecord(body);
  state.buyerGuid = backfillBuyerGuidFromOrderRecord(state.order, state.buyerGuid);
  state.order = finalizeOrderRecord(state.order, body);
  const explicitApiKind = parseExplicitApiKindFromPayload(body, state.order);

  return {
    eventName: state.eventName,
    buyerGuid: state.buyerGuid,
    order: state.order,
    explicitApiKind,
  };
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

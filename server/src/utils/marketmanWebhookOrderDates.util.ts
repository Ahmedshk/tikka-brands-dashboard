import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";

const DELIVERY_UTC_KEYS = ["DeliveryDateUTC", "deliveryDateUTC"] as const;
const DELIVERY_KEYS = ["DeliveryDate", "deliveryDate"] as const;
const SENT_UTC_KEYS = ["SentDateUTC", "sentDateUTC"] as const;
const SENT_KEYS = ["SentDate", "sentDate"] as const;

function pickNonEmptyDateString(
  order: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const v = order[key];
    if (typeof v === "string" && v.trim().length > 0) {
      return v.trim();
    }
  }
  return null;
}

/**
 * Read a MarketMan delivery or sent date from API (`*UTC`) or Hood webhook (`DeliveryDate` / `SentDate`) fields.
 */
export function pickMarketManOrderDateString(
  order: Record<string, unknown>,
  apiKind: MarketManOrderApiKind,
): string | null {
  if (apiKind === "delivery") {
    return (
      pickNonEmptyDateString(order, DELIVERY_UTC_KEYS) ??
      pickNonEmptyDateString(order, DELIVERY_KEYS)
    );
  }
  return (
    pickNonEmptyDateString(order, SENT_UTC_KEYS) ??
    pickNonEmptyDateString(order, SENT_KEYS)
  );
}

/**
 * Copy Hood-style date fields onto `DeliveryDateUTC` / `SentDateUTC` when the API keys are missing
 * so downstream upsert, rollups, and index fields match REST poll shape.
 */
export function normalizeMarketManWebhookOrderDates(
  order: Record<string, unknown>,
): void {
  const delivery = pickMarketManOrderDateString(order, "delivery");
  const sent = pickMarketManOrderDateString(order, "sent");

  if (
    delivery &&
    pickNonEmptyDateString(order, DELIVERY_UTC_KEYS) == null
  ) {
    order.DeliveryDateUTC = delivery;
  }
  if (sent && pickNonEmptyDateString(order, SENT_UTC_KEYS) == null) {
    order.SentDateUTC = sent;
  }
}

/**
 * Prefer delivery when a delivery date exists; otherwise sent; default delivery.
 */
export function inferMarketManOrderApiKindFromOrderRaw(
  order: Record<string, unknown>,
): MarketManOrderApiKind {
  const hasDelivery = pickMarketManOrderDateString(order, "delivery") != null;
  const hasSent = pickMarketManOrderDateString(order, "sent") != null;
  if (hasDelivery) return "delivery";
  if (hasSent) return "sent";
  return "delivery";
}

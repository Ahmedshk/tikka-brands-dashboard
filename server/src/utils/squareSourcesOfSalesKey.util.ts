import type { SquareOrder } from "../services/square.service.js";

const SOURCE_LABEL_MAP: Record<string, string> = {
  "square point of sale": "In-Store",
  "square for restaurants": "In-Store",
  "square pos": "In-Store",
  pos: "In-Store",
  pickup: "Pickup",
  delivery: "Delivery",
  shipment: "Shipment",
  kiosk: "Kiosk",
  doordash: "DoorDash",
  grubhub: "GrubHub",
  "grub hub": "GrubHub",
  other: "Other",
  "in-store": "In-Store",
  simple: "Order",
  order: "Order",
};

export function normalizeTrendSourceKey(key: string): string {
  const normalized = key.trim().toLowerCase().replaceAll("_", "-");
  // For the Sales Trend "group by source" chart, treat Register as:
  // - in-store (POS)
  // - pickup
  if (normalized === "in-store" || normalized === "pickup") return "register";
  return normalized;
}

export function deriveSquareSourcesOfSalesKey(order: SquareOrder): string {
  const sourceName = (order.source?.name ?? "").trim().toLowerCase();
  const fulfillmentType = order.fulfillments?.[0]?.type?.trim().toLowerCase();

  if (sourceName) {
    const mapped = SOURCE_LABEL_MAP[sourceName];
    if (mapped) return mapped.toLowerCase().replaceAll(/\s+/g, "-");
    return sourceName.replaceAll(/\s+/g, "-").replaceAll(/[^a-z0-9-]/g, "");
  }
  if (fulfillmentType) {
    const mapped = SOURCE_LABEL_MAP[fulfillmentType];
    if (mapped) return mapped.toLowerCase().replaceAll(/\s+/g, "-");
    return fulfillmentType;
  }
  return "order";
}

export function segmentKeyToLabel(key: string): string {
  const normalized = key.toLowerCase().replaceAll(/\s+/g, "-");
  return (
    SOURCE_LABEL_MAP[normalized] ??
    key.replaceAll("-", " ").replaceAll(/\b\w/g, (c) => c.toUpperCase())
  );
}


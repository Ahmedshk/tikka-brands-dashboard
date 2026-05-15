/**
 * Helpers for extracting fields from Square `order.*` webhook payload wrappers.
 *
 * Square's order webhooks ship the actual fields under one of several wrapper
 * keys (`order_created`, `order_updated`, `order_fulfillment_updated`),
 * carrying only a summary (`order_id`, `location_id`, `state`, `version`).
 * These helpers normalize access across wrapper variants and also tolerate the
 * full-order shape (`obj.order`) for defensiveness against future API changes.
 */

const ORDER_WEBHOOK_WRAPPER_KEYS = [
  "order_created",
  "order_updated",
  "order_fulfillment_updated",
  "order",
] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function pickSquareOrderWebhookWrapper(
  obj: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  for (const key of ORDER_WEBHOOK_WRAPPER_KEYS) {
    const candidate = asRecord(obj[key]);
    if (candidate) return candidate;
  }
  return obj;
}

export function getSquareOrderIdFromWebhookWrapper(
  wrapper: Record<string, unknown> | undefined,
): string {
  if (!wrapper) return "";
  return asTrimmedString(wrapper.order_id) || asTrimmedString(wrapper.id);
}

export function getSquareLocationIdFromWebhookWrapper(
  wrapper: Record<string, unknown> | undefined,
): string {
  if (!wrapper) return "";
  return asTrimmedString(wrapper.location_id) || asTrimmedString(wrapper.locationId);
}

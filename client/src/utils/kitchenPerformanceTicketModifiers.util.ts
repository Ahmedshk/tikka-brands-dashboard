import type { KitchenPerformanceTicketLineItem } from "../types/kitchenPerformance.types";

const DEFAULT_VARIATION_LABELS = new Set(["regular", "default"]);

function normalizeLookupPart(value: string | null | undefined): string {
  return (value?.trim() || "Regular").toLowerCase();
}

function itemSalesLookupKey(itemName: string, variation: string | null | undefined): string {
  return `${itemName.trim().toLowerCase()}::${normalizeLookupPart(variation)}`;
}

function kitchenPerformanceVariationOption(
  variation: string | null | undefined,
): string | null {
  const text = variation?.trim() ?? "";
  if (!text) return null;
  if (DEFAULT_VARIATION_LABELS.has(text.toLowerCase())) return null;
  return text;
}

export function mergeKitchenPerformanceTicketLineItemOptions(
  item: KitchenPerformanceTicketLineItem,
  modifiersByOrderId: Record<string, Record<string, string[]>>,
): KitchenPerformanceTicketLineItem {
  const options: string[] = [];
  const variationOption = kitchenPerformanceVariationOption(item.variation);
  if (variationOption) {
    options.push(variationOption);
  }

  if (item.orderId) {
    const modifiers =
      modifiersByOrderId[item.orderId]?.[
        itemSalesLookupKey(item.itemName, item.variation ?? null)
      ] ?? [];
    for (const modifier of modifiers) {
      if (!options.includes(modifier)) {
        options.push(modifier);
      }
    }
  }

  for (const existing of item.options) {
    if (!options.includes(existing)) {
      options.push(existing);
    }
  }

  return {
    ...item,
    options,
  };
}

export function collectKitchenPerformanceTicketOrderIds(
  lineItems: KitchenPerformanceTicketLineItem[],
): string[] {
  const ids = new Set<string>();
  for (const item of lineItems) {
    const orderId = item.orderId?.trim();
    if (orderId) ids.add(orderId);
  }
  return [...ids];
}

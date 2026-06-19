import { formatKitchenPerformanceItemName } from "./kitchenPerformanceItemName.util.js";
import type { KitchenPerformanceTicketLineItemDto } from "../types/kitchenPerformance.types.js";

export type { KitchenPerformanceTicketLineItemDto };

const DEFAULT_VARIATION_LABELS = new Set(["regular", "default"]);

function normalizeLookupPart(value: string | null | undefined): string {
  return (value?.trim() || "Regular").toLowerCase();
}

function itemSalesLookupKey(itemName: string, variation: string | null): string {
  return `${itemName.trim().toLowerCase()}::${normalizeLookupPart(variation)}`;
}

/** Variations like "Regular" are omitted from ticket detail sub-lines (Square behavior). */
export function kitchenPerformanceVariationOption(
  variation: string | null | undefined,
): string | null {
  const text = variation?.trim() ?? "";
  if (!text) return null;
  if (DEFAULT_VARIATION_LABELS.has(text.toLowerCase())) return null;
  return text;
}

export function buildItemSalesModifierLookup(
  itemSalesRows: Record<string, unknown>[],
): Map<string, Map<string, string[]>> {
  const byOrder = new Map<string, Map<string, string[]>>();

  for (const row of itemSalesRows) {
    const orderId = readStr(row, "ItemSales.order_id");
    const itemName = readStr(row, "ItemSales.item_name");
    if (!orderId || !itemName) continue;

    const variation = readStr(row, "ItemSales.item_variation_name");
    const modifierName = readStr(row, "ItemSales.modifier_name");
    const key = itemSalesLookupKey(itemName, variation);

    const orderMap = byOrder.get(orderId) ?? new Map<string, string[]>();
    const options = orderMap.get(key) ?? [];

    if (modifierName && !options.includes(modifierName)) {
      options.push(modifierName);
    }

    orderMap.set(key, options);
    byOrder.set(orderId, orderMap);
  }

  return byOrder;
}

export function resolveKitchenPerformanceTicketLineOptions(
  itemName: string,
  variation: string | null,
  orderId: string | null,
  modifierLookup: Map<string, Map<string, string[]>>,
): string[] {
  const options: string[] = [];
  const variationOption = kitchenPerformanceVariationOption(variation);
  if (variationOption) {
    options.push(variationOption);
  }

  if (!orderId) return options;

  const modifiers =
    modifierLookup.get(orderId)?.get(itemSalesLookupKey(itemName, variation)) ?? [];
  for (const modifier of modifiers) {
    if (!options.includes(modifier)) {
      options.push(modifier);
    }
  }

  return options;
}

export function buildKitchenPerformanceTicketLineItem(
  itemName: string,
  variation: string | null,
  quantity: number,
  orderId: string | null,
  modifierLookup: Map<string, Map<string, string[]>>,
): KitchenPerformanceTicketLineItemDto {
  return {
    itemName: itemName.trim(),
    quantity: Math.max(1, Math.round(quantity)),
    options: resolveKitchenPerformanceTicketLineOptions(
      itemName,
      variation,
      orderId,
      modifierLookup,
    ),
    orderId,
    variation,
  };
}

export interface KitchenPerformanceTicketLineItemSource {
  itemName: string;
  variation: string | null;
  quantity: number;
}

/** Serialized ticket items for item-performance drill-down (includes variation in name). */
export function formatKitchenPerformanceItemsInTicket(
  items: KitchenPerformanceTicketLineItemSource[],
): string | null {
  if (items.length === 0) return null;

  return items
    .map((item) => {
      const label = formatKitchenPerformanceItemName(item.itemName, item.variation);
      return `${item.quantity} x ${label}`;
    })
    .join("; ");
}

function readStr(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

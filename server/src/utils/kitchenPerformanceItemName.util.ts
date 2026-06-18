/** Square item performance rows use "Item Name - Variation" when a variation exists. */
export function formatKitchenPerformanceItemName(
  itemName: string | null,
  variation: string | null,
): string {
  const name = itemName?.trim() ?? "";
  const variationText = variation?.trim() ?? "";

  if (!name) return variationText || "Unknown item";
  if (!variationText) return name;

  return `${name} - ${variationText}`;
}

const DEFAULT_ITEM_PERFORMANCE_VARIATIONS = new Set(["regular", "default"]);

/** Square's item performance tab hides default variations like "Regular" in the label. */
export function formatKitchenPerformanceItemPerformanceName(
  itemName: string | null,
  variation: string | null,
): string {
  const name = itemName?.trim() ?? "";
  const variationText = variation?.trim() ?? "";

  if (!name) return variationText || "Unknown item";
  if (
    !variationText ||
    DEFAULT_ITEM_PERFORMANCE_VARIATIONS.has(variationText.toLowerCase())
  ) {
    return name;
  }

  return `${name} - ${variationText}`;
}

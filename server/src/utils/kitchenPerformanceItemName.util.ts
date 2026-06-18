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

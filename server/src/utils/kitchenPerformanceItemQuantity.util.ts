function kdsStr(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function kdsNum(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildKitchenPerformanceItemQuantityKey(
  itemName: string,
  variation: string | null,
): string {
  return `${itemName.trim().toLowerCase()}::${(variation?.trim() ?? "").toLowerCase()}`;
}

/**
 * Sum item units from KDS line items, deduping expeditor duplicates (same ticket_key + item).
 * Square's `quantity_sold` measure can read 2x on expo stations; line-item dedupe matches Square UI.
 */
export function sumDedupedKdsItemQuantitiesByItemKey(
  lineItemRows: Record<string, unknown>[],
  deviceName: string,
): Map<string, number> {
  const normalizedDevice = deviceName.trim();
  const seenLineKeys = new Set<string>();
  const totals = new Map<string, number>();

  for (const row of lineItemRows) {
    const rowDevice = kdsStr(row, "KDS.device_code_name")?.trim() ?? "";
    if (rowDevice !== normalizedDevice) continue;

    const ticketKey = kdsStr(row, "KDS.ticket_key");
    const itemName = kdsStr(row, "KDS.item_name");
    if (!ticketKey || !itemName) continue;

    const variation = kdsStr(row, "KDS.variation");
    const itemKey = buildKitchenPerformanceItemQuantityKey(itemName, variation);
    const lineKey = `${ticketKey}::${itemKey}`;
    if (seenLineKeys.has(lineKey)) continue;
    seenLineKeys.add(lineKey);

    const quantity = Math.max(1, Math.round(kdsNum(row, "KDS.quantity") ?? 1));
    totals.set(itemKey, (totals.get(itemKey) ?? 0) + quantity);
  }

  return totals;
}

/**
 * Prefer Square `quantity_sold` unless it is clearly 2x inflated vs deduped line items.
 * When deduped is 1 short (missing row), trust the API value.
 */
export function resolveKitchenPerformanceItemTotalQuantity(
  quantitySold: number,
  dedupedQuantity: number,
): number {
  const apiQty = Math.max(0, Math.round(quantitySold));
  const dedupedQty = Math.max(0, Math.round(dedupedQuantity));

  if (apiQty <= 0 && dedupedQty <= 0) return 0;
  if (dedupedQty <= 0) return apiQty;
  if (apiQty <= 0) return dedupedQty;
  if (apiQty === dedupedQty * 2) return dedupedQty;

  const halfApi = Math.round(apiQty / 2);
  if (halfApi === dedupedQty || halfApi === dedupedQty + 1) {
    return halfApi;
  }

  return Math.max(apiQty, dedupedQty);
}

import { UNCATEGORIZED_CATEGORY_ROLLUP_ID } from "./squareCategoryRollupBreakdownConstants.util.js";

function catalogLineToCategoryId(
  catalogObjectId: string | undefined,
  variationToItemId: Record<string, string>,
  itemIdToCategoryId: Record<string, string>,
): string {
  if (catalogObjectId == null || catalogObjectId === "") {
    return UNCATEGORIZED_CATEGORY_ROLLUP_ID;
  }
  const itemId = variationToItemId[catalogObjectId];
  if (itemId == null || itemId === "") {
    return UNCATEGORIZED_CATEGORY_ROLLUP_ID;
  }
  return itemIdToCategoryId[itemId] ?? UNCATEGORIZED_CATEGORY_ROLLUP_ID;
}

type AllocationRow = { key: string; base: number; rem: number };

function compareAllocationRowsForRemainder(a: AllocationRow, b: AllocationRow): number {
  if (b.rem !== a.rem) return b.rem - a.rem;
  if (a.key !== b.key) return a.key.localeCompare(b.key);
  return b.base - a.base;
}

/**
 * Allocate `orderNetCents` across category keys proportionally to positive integer weights
 * (largest remainder; integer-safe).
 */
export function allocateOrderNetCentsLargestRemainder(
  orderNetCents: number,
  weightByCategory: ReadonlyMap<string, number>,
): Map<string, number> {
  const entries = [...weightByCategory.entries()].filter(([, w]) => w > 0);
  const res = new Map<string, number>();
  if (orderNetCents <= 0 || entries.length === 0) return res;
  const denom = entries.reduce((s, [, w]) => s + w, 0);
  if (denom <= 0) return res;

  const rows: AllocationRow[] = [];
  let baseSum = 0;
  for (const [key, w] of entries) {
    const numer = orderNetCents * w;
    const base = Math.floor(numer / denom);
    const rem = numer - base * denom;
    rows.push({ key, base, rem });
    baseSum += base;
  }
  let leftover = orderNetCents - baseSum;
  if (leftover > 0) {
    rows.sort(compareAllocationRowsForRemainder);
    const n = rows.length;
    let idx = 0;
    while (leftover > 0) {
      const row = rows[idx % n];
      if (row === undefined) break;
      row.base += 1;
      leftover -= 1;
      idx += 1;
    }
  }
  for (const r of rows) {
    if (r.base !== 0) res.set(r.key, r.base);
  }
  return res;
}

export function buildWeightByCategoryForOrderLines(
  lineItems: unknown[] | undefined,
  variationToItemId: Record<string, string>,
  itemIdToCategoryId: Record<string, string>,
  getLineCents: (line: unknown) => number,
): Map<string, number> {
  const weightByCategory = new Map<string, number>();
  for (const line of lineItems ?? []) {
    const catalogObjectId = (line as { catalog_object_id?: string }).catalog_object_id?.trim();
    const catId = catalogLineToCategoryId(
      catalogObjectId,
      variationToItemId,
      itemIdToCategoryId,
    );
    const w = getLineCents(line);
    if (!Number.isFinite(w) || w <= 0) continue;
    weightByCategory.set(catId, (weightByCategory.get(catId) ?? 0) + w);
  }
  return weightByCategory;
}

export function mergeAllocatedCentsIntoMaps(
  netByCategory: Map<string, number>,
  txnByCategory: Map<string, number>,
  allocated: ReadonlyMap<string, number>,
): void {
  for (const [catId, cents] of allocated.entries()) {
    netByCategory.set(catId, (netByCategory.get(catId) ?? 0) + cents);
    if (cents > 0) {
      txnByCategory.set(catId, (txnByCategory.get(catId) ?? 0) + 1);
    }
  }
}

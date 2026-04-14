/**
 * Helpers for Square net sales by category. Extracted to keep cognitive complexity low.
 */

export interface NetSalesByCategoryResult {
  categories: Array<{ name: string; netSalesCents: number }>;
  totalNetSalesCents: number;
}

/** Minimal order shape for aggregation (line_items with catalog_object_id and total_money). */
export interface OrderForCategoryAggregation {
  line_items?: Array<{
    catalog_object_id?: string;
    total_money?: unknown;
  }>;
}

/** Square Money.amount is bigint-compatible; matches `moneyToCents` in square.service. */
export function lineItemTotalMoneyToCents(line: unknown): number {
  const l = line as { total_money?: { amount?: bigint | number | string } };
  const m = l.total_money;
  if (m?.amount == null) return 0;
  const n = Number(m.amount);
  return Number.isNaN(n) ? 0 : n;
}

export interface VariationCentsAggregation {
  variationToCents: Record<string, number>;
  totalNetSalesCents: number;
  uncategorizedLineCents: number;
}

function allocateProportionalCentsByKey(
  totalCents: number,
  keyToWeightCents: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!Number.isFinite(totalCents) || totalCents <= 0) return result;
  const entries = [...keyToWeightCents.entries()].filter(([, w]) => Number.isFinite(w) && w > 0);
  if (entries.length === 0) return result;

  const denom = entries.reduce((s, [, w]) => s + w, 0);
  if (!Number.isFinite(denom) || denom <= 0) return result;

  type Row = { key: string; base: number; rem: number };
  const rows: Row[] = [];
  let allocatedBase = 0;
  for (const [key, weight] of entries) {
    const numer = totalCents * weight;
    const base = Math.floor(numer / denom);
    const rem = numer - base * denom; // numer % denom, but safe with JS numbers
    rows.push({ key, base, rem });
    allocatedBase += base;
  }

  let leftover = totalCents - allocatedBase;
  if (leftover > 0) {
    rows.sort((a, b) => {
      if (b.rem !== a.rem) return b.rem - a.rem;
      // Stable-ish tie-breaker for determinism: key then base.
      if (a.key !== b.key) return a.key.localeCompare(b.key);
      return b.base - a.base;
    });
    let idx = 0;
    while (leftover > 0 && rows.length > 0) {
      rows[idx]!.base += 1;
      leftover -= 1;
      idx = (idx + 1) % rows.length;
    }
  }

  for (const r of rows) {
    if (r.base !== 0) result.set(r.key, r.base);
  }
  return result;
}

/**
 * Aggregate net sales from orders into variationToCents (and uncategorized line cents).
 * Uses integer-cent proportional allocation (largest remainder) by line total_money,
 * so per-order allocated cents always sum exactly to the order's net cents.
 */
export function aggregateVariationCentsFromOrders(
  orders: OrderForCategoryAggregation[],
  isCounted: (order: unknown) => boolean,
  getOrderCents: (order: unknown) => number,
  getLineCents: (line: unknown) => number,
): VariationCentsAggregation {
  const variationToCents: Record<string, number> = {};
  let totalNetSalesCents = 0;
  let uncategorizedLineCents = 0;

  for (const order of orders) {
    if (!isCounted(order)) continue;
    const orderNetCents = getOrderCents(order);
    totalNetSalesCents += orderNetCents;
    const lineItems = order.line_items ?? [];
    const keyToWeightCents = new Map<string, number>();
    for (const line of lineItems) {
      const key =
        (line as { catalog_object_id?: string }).catalog_object_id?.trim() ??
        "";
      const weight = getLineCents(line);
      if (!Number.isFinite(weight) || weight <= 0) continue;
      keyToWeightCents.set(key, (keyToWeightCents.get(key) ?? 0) + weight);
    }
    const allocated = allocateProportionalCentsByKey(orderNetCents, keyToWeightCents);
    for (const [key, cents] of allocated.entries()) {
      if (key === "") {
        uncategorizedLineCents += cents;
      } else {
        variationToCents[key] = (variationToCents[key] ?? 0) + cents;
      }
    }
  }

  return {
    variationToCents,
    totalNetSalesCents,
    uncategorizedLineCents,
  };
}

/** Catalog object shape for batch retrieve (variation/item/category). */
export interface CatalogObjectForCategory {
  type?: string;
  id?: string;
  item_variation_data?: { item_id?: string };
  item_data?: {
    category_id?: string;
    /** Preferred for reporting; matches Square Dashboard category sales. */
    reporting_category?: { id?: string };
    categories?: Array<{ id?: string }>;
  };
  category_data?: { name?: string };
}

export function categoryIdFromItem(obj: CatalogObjectForCategory): string | undefined {
  const data = obj.item_data;
  if (data == null) return undefined;
  const reportingId = data.reporting_category?.id;
  if (reportingId != null && reportingId !== "") return reportingId;
  if (data.category_id != null && data.category_id !== "")
    return data.category_id;
  const first = data.categories?.[0];
  return first?.id;
}

export type BatchRetrieveCatalogFn = (
  objectIds: string[],
  accessToken: string,
  includeRelated: boolean,
) => Promise<{
  objects?: CatalogObjectForCategory[];
  related_objects?: CatalogObjectForCategory[];
}>;

function processCatalogObjects(
  objects: CatalogObjectForCategory[],
  variationToItemId: Record<string, string>,
  itemIdToCategoryId: Record<string, string>,
): void {
  for (const obj of objects) {
    if (
      obj.type === "ITEM_VARIATION" &&
      obj.id != null &&
      obj.item_variation_data?.item_id != null
    ) {
      variationToItemId[obj.id] = obj.item_variation_data.item_id;
    } else if (obj.type === "ITEM" && obj.id != null) {
      variationToItemId[obj.id] = obj.id;
      const catId = categoryIdFromItem(obj);
      if (catId != null) itemIdToCategoryId[obj.id] = catId;
    }
  }
}

function processRelatedObjects(
  related: CatalogObjectForCategory[],
  itemIdToCategoryId: Record<string, string>,
): void {
  for (const obj of related) {
    if (obj.type === "ITEM" && obj.id != null) {
      const catId = categoryIdFromItem(obj);
      if (catId != null) itemIdToCategoryId[obj.id] = catId;
    }
  }
}

function processCatalogChunk(
  objects: CatalogObjectForCategory[],
  related: CatalogObjectForCategory[],
  variationToItemId: Record<string, string>,
  itemIdToCategoryId: Record<string, string>,
): void {
  processCatalogObjects(objects, variationToItemId, itemIdToCategoryId);
  processRelatedObjects(related, itemIdToCategoryId);
}

/**
 * Resolve variation IDs to item IDs and item IDs to category IDs via batch catalog.
 */
export async function resolveVariationToItemAndCategoryIds(
  variationIds: string[],
  batchRetrieve: BatchRetrieveCatalogFn,
  accessToken: string,
  batchLimit: number,
): Promise<{
  variationToItemId: Record<string, string>;
  itemIdToCategoryId: Record<string, string>;
}> {
  const variationToItemId: Record<string, string> = {};
  const itemIdToCategoryId: Record<string, string> = {};

  for (let i = 0; i < variationIds.length; i += batchLimit) {
    const chunk = variationIds.slice(i, i + batchLimit);
    const resp = await batchRetrieve(chunk, accessToken, true);
    processCatalogChunk(
      resp.objects ?? [],
      resp.related_objects ?? [],
      variationToItemId,
      itemIdToCategoryId,
    );
  }

  return { variationToItemId, itemIdToCategoryId };
}

/**
 * Fetch category names by ID via batch catalog.
 */
export async function resolveCategoryIdToName(
  categoryIds: string[],
  batchRetrieve: BatchRetrieveCatalogFn,
  accessToken: string,
  batchLimit: number,
): Promise<Record<string, string>> {
  const categoryIdToName: Record<string, string> = {};
  if (categoryIds.length === 0) return categoryIdToName;

  for (let i = 0; i < categoryIds.length; i += batchLimit) {
    const chunk = categoryIds.slice(i, i + batchLimit);
    const resp = await batchRetrieve(chunk, accessToken, false);
    const objects = resp.objects ?? [];
    for (const obj of objects) {
      if (
        obj.type === "CATEGORY" &&
        obj.id != null &&
        obj.category_data?.name != null
      ) {
        categoryIdToName[obj.id] = obj.category_data.name;
      }
    }
  }
  return categoryIdToName;
}

/**
 * Build sorted categories array from variation cents and resolution maps.
 */
export function buildCategoriesList(
  variationToCents: Record<string, number>,
  variationToItemId: Record<string, string>,
  itemIdToCategoryId: Record<string, string>,
  categoryIdToName: Record<string, string>,
  uncategorizedLineCents: number,
  uncategorizedLabel: string,
): Array<{ name: string; netSalesCents: number }> {
  const variationIds = Object.keys(variationToCents);
  const byCategory: Record<string, number> = {};
  if (uncategorizedLineCents > 0) {
    byCategory[uncategorizedLabel] = uncategorizedLineCents;
  }
  for (const variationId of variationIds) {
    const itemId = variationToItemId[variationId];
    const categoryId = itemId == null ? undefined : itemIdToCategoryId[itemId];
    const name =
      categoryId == null
        ? uncategorizedLabel
        : (categoryIdToName[categoryId] ?? uncategorizedLabel);
    const cents = variationToCents[variationId] ?? 0;
    byCategory[name] = (byCategory[name] ?? 0) + cents;
  }
  return Object.entries(byCategory)
    .map(([name, netSalesCents]) => ({ name, netSalesCents }))
    .sort((a, b) => b.netSalesCents - a.netSalesCents);
}

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

export interface VariationCentsAggregation {
  variationToCents: Record<string, number>;
  totalNetSalesCents: number;
  uncategorizedLineCents: number;
}

/**
 * Aggregate net sales from orders into variationToCents (and uncategorized line cents).
 * Uses proportional allocation by line total_money.
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
    const orderTotalCents = lineItems.reduce(
      (sum, line) => sum + getLineCents(line),
      0,
    );
    if (orderTotalCents <= 0) continue;
    for (const line of lineItems) {
      const catalogObjectId = (line as { catalog_object_id?: string }).catalog_object_id?.trim();
      const lineCents =
        orderNetCents * (getLineCents(line) / orderTotalCents);
      if (catalogObjectId === undefined || catalogObjectId === "") {
        uncategorizedLineCents += lineCents;
        continue;
      }
      variationToCents[catalogObjectId] =
        (variationToCents[catalogObjectId] ?? 0) + lineCents;
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
    categories?: Array<{ id?: string }>;
  };
  category_data?: { name?: string };
}

export function categoryIdFromItem(obj: CatalogObjectForCategory): string | undefined {
  const data = obj.item_data;
  if (data == null) return undefined;
  if (data.category_id != null) return data.category_id;
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

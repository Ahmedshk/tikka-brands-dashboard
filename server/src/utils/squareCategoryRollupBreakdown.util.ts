/**
 * Per-category net sales and transaction counts for Square order rollups (daily + period).
 * Allocation matches `aggregateVariationCentsFromOrders`; stable merge key is Square CATEGORY id.
 */

import {
  resolveCategoryIdToName,
  resolveVariationToItemAndCategoryIds,
  type BatchRetrieveCatalogFn,
  type OrderForCategoryAggregation,
} from "./squareNetSalesByCategoryHelpers.js";
import {
  UNCATEGORIZED_CATEGORY_DISPLAY_LABEL,
  UNCATEGORIZED_CATEGORY_ROLLUP_ID,
} from "./squareCategoryRollupBreakdownConstants.util.js";
import {
  allocateOrderNetCentsLargestRemainder,
  buildWeightByCategoryForOrderLines,
  mergeAllocatedCentsIntoMaps,
} from "./squareCategoryRollupBreakdownHelpers.util.js";

export {
  UNCATEGORIZED_CATEGORY_ROLLUP_ID,
  UNCATEGORIZED_CATEGORY_DISPLAY_LABEL,
} from "./squareCategoryRollupBreakdownConstants.util.js";

/** Batch retrieve chunk size; keep in sync with `BATCH_RETRIEVE_CATALOG_LIMIT` in square.service. */
const BATCH_RETRIEVE_CATALOG_CHUNK = 100;

export interface CategoryRollupBreakdownRow {
  categoryId: string;
  netSalesCents: number;
  transactionCount: number;
  nameSnapshot?: string;
}

function collectCatalogObjectIdsFromOrders(
  orders: OrderForCategoryAggregation[],
  isCounted: (order: unknown) => boolean,
): string[] {
  const ids = new Set<string>();
  for (const order of orders) {
    if (!isCounted(order)) continue;
    for (const line of order.line_items ?? []) {
      const id = (line as { catalog_object_id?: string }).catalog_object_id?.trim();
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Merge category rows from daily rollup docs by `categoryId` (sum cents and transaction counts).
 */
export function mergeCategoryBreakdownFromDailyRollupDocs(
  docs: Array<{ categoriesBreakdown?: CategoryRollupBreakdownRow[] }>,
): CategoryRollupBreakdownRow[] {
  type Acc = {
    netSalesCents: number;
    transactionCount: number;
    nameSnapshot?: string;
  };
  const byId = new Map<string, Acc>();
  for (const doc of docs) {
    const rows = doc.categoriesBreakdown;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const id = row.categoryId;
      const cur: Acc = byId.get(id) ?? {
        netSalesCents: 0,
        transactionCount: 0,
      };
      cur.netSalesCents += row.netSalesCents ?? 0;
      cur.transactionCount += row.transactionCount ?? 0;
      const snap = row.nameSnapshot?.trim();
      if (snap != null && snap !== "" && cur.nameSnapshot == null) {
        cur.nameSnapshot = snap;
      }
      byId.set(id, cur);
    }
  }
  return [...byId.entries()]
    .map(([categoryId, v]) => {
      const base = {
        categoryId,
        netSalesCents: v.netSalesCents,
        transactionCount: v.transactionCount,
      };
      return v.nameSnapshot != null && v.nameSnapshot !== ""
        ? { ...base, nameSnapshot: v.nameSnapshot }
        : base;
    })
    .sort((a, b) => b.netSalesCents - a.netSalesCents);
}

export async function computeCategoryBreakdownFromOrdersForRollup(
  orders: OrderForCategoryAggregation[],
  batchRetrieve: BatchRetrieveCatalogFn,
  accessToken: string,
  options: {
    isCounted: (order: unknown) => boolean;
    getOrderCents: (order: unknown) => number;
    getLineCents: (line: unknown) => number;
  },
  batchLimit: number = BATCH_RETRIEVE_CATALOG_CHUNK,
): Promise<CategoryRollupBreakdownRow[]> {
  const catalogIds = collectCatalogObjectIdsFromOrders(orders, options.isCounted);
  const { variationToItemId, itemIdToCategoryId } =
    catalogIds.length === 0
      ? { variationToItemId: {}, itemIdToCategoryId: {} }
      : await resolveVariationToItemAndCategoryIds(
          catalogIds,
          batchRetrieve,
          accessToken,
          batchLimit,
        );

  const netByCategory = new Map<string, number>();
  const txnByCategory = new Map<string, number>();
  for (const order of orders) {
    if (!options.isCounted(order)) continue;
    const orderNetCents = options.getOrderCents(order);
    const weightByCategory = buildWeightByCategoryForOrderLines(
      order.line_items,
      variationToItemId,
      itemIdToCategoryId,
      options.getLineCents,
    );
    const allocated = allocateOrderNetCentsLargestRemainder(orderNetCents, weightByCategory);
    mergeAllocatedCentsIntoMaps(netByCategory, txnByCategory, allocated);
  }

  const allIds = new Set<string>([...netByCategory.keys(), ...txnByCategory.keys()]);
  const categoryIdsForNames = [...allIds].filter((id) => id !== UNCATEGORIZED_CATEGORY_ROLLUP_ID);
  const idToName =
    categoryIdsForNames.length === 0
      ? {}
      : await resolveCategoryIdToName(
          categoryIdsForNames,
          batchRetrieve,
          accessToken,
          batchLimit,
        );

  const rows: CategoryRollupBreakdownRow[] = [];
  for (const categoryId of allIds) {
    const netSalesCents = netByCategory.get(categoryId) ?? 0;
    const transactionCount = txnByCategory.get(categoryId) ?? 0;
    if (netSalesCents === 0 && transactionCount === 0) continue;
    const nameSnapshot =
      categoryId === UNCATEGORIZED_CATEGORY_ROLLUP_ID
        ? UNCATEGORIZED_CATEGORY_DISPLAY_LABEL
        : idToName[categoryId];
    rows.push({
      categoryId,
      netSalesCents,
      transactionCount,
      ...(nameSnapshot ? { nameSnapshot } : {}),
    });
  }
  rows.sort((a, b) => b.netSalesCents - a.netSalesCents);
  return rows;
}

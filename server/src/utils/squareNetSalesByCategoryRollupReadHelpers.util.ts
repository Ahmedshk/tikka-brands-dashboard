import {
  UNCATEGORIZED_CATEGORY_DISPLAY_LABEL,
  UNCATEGORIZED_CATEGORY_ROLLUP_ID,
  type CategoryRollupBreakdownRow,
} from "./squareCategoryRollupBreakdown.util.js";
import {
  resolveCategoryIdToName,
  type BatchRetrieveCatalogFn,
  type NetSalesByCategoryResult,
} from "./squareNetSalesByCategoryHelpers.js";
import {
  businessDateKeysForMonthPeriod,
  businessDateKeysForWeekPeriod,
  monthPeriodKeyFromBusinessDateKey,
  sundayWeekStartYmdForBusinessDateKey,
} from "./rollupPeriodKeys.util.js";

export function rollupPeriodDayKeysMatchRangeKeys(
  periodKeys: string[],
  rangeKeys: string[],
): boolean {
  return periodKeys.length > 0 && periodKeys.join("\n") === rangeKeys.join("\n");
}

/**
 * When fully-covered range keys equal a full week or month period, prefer period rollup read.
 */
export function matchNetSalesByCategoryRangeToPeriodRollup(
  keys: string[],
  timezone: string,
): { granularity: "week" | "month"; periodKey: string } | null {
  const tz = timezone.trim() || "UTC";
  const first = keys[0];
  if (first === undefined) return null;

  const weekStart = sundayWeekStartYmdForBusinessDateKey(first, tz);
  const weekKeys = businessDateKeysForWeekPeriod(weekStart, tz);
  if (rollupPeriodDayKeysMatchRangeKeys(weekKeys, keys)) {
    return { granularity: "week", periodKey: weekStart };
  }

  const monthKey = monthPeriodKeyFromBusinessDateKey(first);
  const monthKeys = businessDateKeysForMonthPeriod(monthKey, tz);
  if (rollupPeriodDayKeysMatchRangeKeys(monthKeys, keys)) {
    return { granularity: "month", periodKey: monthKey };
  }

  return null;
}

/** First business-date key missing a usable `categoriesBreakdown` on its rollup doc. */
export function firstMissingCategoriesBreakdownKey(
  keys: string[],
  byKey: Map<string, { categoriesBreakdown?: unknown }>,
): string | null {
  for (const k of keys) {
    const d = byKey.get(k);
    if (d == null || !Array.isArray(d.categoriesBreakdown)) {
      return k;
    }
  }
  return null;
}

export async function netSalesByCategoryResultFromMergedBreakdown(
  merged: CategoryRollupBreakdownRow[],
  batchRetrieve: BatchRetrieveCatalogFn,
  accessToken: string,
  batchChunkSize: number,
): Promise<NetSalesByCategoryResult> {
  const categoryIds = [
    ...new Set(
      merged
        .map((r) => r.categoryId)
        .filter((id) => id !== UNCATEGORIZED_CATEGORY_ROLLUP_ID),
    ),
  ];
  const idToName =
    categoryIds.length === 0
      ? ({} as Record<string, string>)
      : await resolveCategoryIdToName(
          categoryIds,
          batchRetrieve,
          accessToken,
          batchChunkSize,
        );

  const byDisplayName: Record<string, number> = {};
  for (const row of merged) {
    const name =
      row.categoryId === UNCATEGORIZED_CATEGORY_ROLLUP_ID
        ? UNCATEGORIZED_CATEGORY_DISPLAY_LABEL
        : (idToName[row.categoryId] ??
          row.nameSnapshot ??
          UNCATEGORIZED_CATEGORY_DISPLAY_LABEL);
    byDisplayName[name] = (byDisplayName[name] ?? 0) + row.netSalesCents;
  }
  const categories = Object.entries(byDisplayName)
    .map(([name, netSalesCents]) => ({ name, netSalesCents }))
    .sort((a, b) => b.netSalesCents - a.netSalesCents);
  const totalNetSalesCents = merged.reduce(
    (s, r) => s + r.netSalesCents,
    0,
  );
  return { categories, totalNetSalesCents };
}

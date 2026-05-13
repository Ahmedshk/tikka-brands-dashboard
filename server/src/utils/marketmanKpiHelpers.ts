/**
 * Helpers for MarketMan inventory KPIs. Extracted to keep cognitive complexity low.
 */

export interface ActualTheoValue {
  currentFoodCost: number | null;
  inventoryValue: number | null;
  wasteCost: number | null;
  foodCostPercent: number | null;
  theoreticalUsage: number | null;
  theoreticalUsagePercent: number | null;
  varianceItems: Array<{
    label: string;
    varianceCost: number;
    actualCost?: number;
    theoreticalCost?: number;
    actualQuantity?: number;
    theoreticalQuantity?: number;
    uom?: string;
  }>;
  countPeriodStart: string | null;
  countPeriodEnd: string | null;
}

export interface PendingOrdersValue {
  count: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

/** Mutable shape for inventory KPIs result (no index signature so service result is assignable). */
export interface InventoryKPIsResultShape {
  currentFoodCost: number | null;
  inventoryValue: number | null;
  wasteCost: number | null;
  foodCostPercent: number | null;
  theoreticalUsage: number | null;
  theoreticalUsagePercent: number | null;
  varianceItems: unknown[];
  pendingOrdersCount: number | null;
  countPeriodStart?: string | null;
  countPeriodEnd?: string | null;
  pendingOrdersPeriodStart?: string | null;
  pendingOrdersPeriodEnd?: string | null;
}

export function mergeActualTheoIntoResult(
  result: InventoryKPIsResultShape,
  value: ActualTheoValue,
): void {
  if (value.currentFoodCost != null) result.currentFoodCost = value.currentFoodCost;
  if (value.inventoryValue != null) result.inventoryValue = value.inventoryValue;
  if (value.wasteCost != null) result.wasteCost = value.wasteCost;
  if (value.foodCostPercent != null) result.foodCostPercent = value.foodCostPercent;
  if (value.theoreticalUsage != null) result.theoreticalUsage = value.theoreticalUsage;
  if (value.theoreticalUsagePercent != null) {
    result.theoreticalUsagePercent = value.theoreticalUsagePercent;
  }
  result.countPeriodStart = value.countPeriodStart ?? null;
  result.countPeriodEnd = value.countPeriodEnd ?? null;
  if (Array.isArray(value.varianceItems)) result.varianceItems = value.varianceItems;
}

export function mergePendingOrdersIntoResult(
  result: InventoryKPIsResultShape,
  value: PendingOrdersValue,
): void {
  result.pendingOrdersCount = value.count;
  result.pendingOrdersPeriodStart = value.periodStart ?? null;
  result.pendingOrdersPeriodEnd = value.periodEnd ?? null;
}

const METRICS_REQUIRING_COUNT_PERIOD = new Set([
  "currentFoodCost",
  "inventoryValue",
  "wasteCost",
  "foodCostPercent",
  "varianceItems",
]);

export function filterResultByRequestedMetrics(
  result: InventoryKPIsResultShape,
  requestedMetrics: string[],
): InventoryKPIsResultShape {
  const filtered: Record<string, unknown> = {};
  const includeCountPeriod = requestedMetrics.some((m) =>
    METRICS_REQUIRING_COUNT_PERIOD.has(m),
  );
  const includePendingPeriod = requestedMetrics.includes("pendingOrdersCount");

  for (const k of requestedMetrics) {
    if (k in result) filtered[k] = result[k as keyof InventoryKPIsResultShape];
  }
  if (includeCountPeriod) {
    filtered.countPeriodStart = result.countPeriodStart ?? null;
    filtered.countPeriodEnd = result.countPeriodEnd ?? null;
  }
  if (includePendingPeriod) {
    filtered.pendingOrdersPeriodStart = result.pendingOrdersPeriodStart ?? null;
    filtered.pendingOrdersPeriodEnd = result.pendingOrdersPeriodEnd ?? null;
  }
  return filtered as unknown as InventoryKPIsResultShape;
}

export interface ActualTheoFetchers {
  getValidCountDates: (buyerGuid: string) => Promise<{
    startDates: string[];
    endDates: string[];
  } | null>;
  fetchActualTheoDataByDateRange: (
    buyerGuid: string,
    countStart: string,
    countEnd: string,
  ) => Promise<ActualTheoValue>;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Parse GetActualTheoDataByBuyer JSON (same shape as live API) into KPI fields.
 */
export function parseActualTheoApiResponse(
  data: unknown,
  countStart: string,
  countEnd: string,
): ActualTheoValue {
  const d = data as {
    ActualTheoDataRows?: Array<{
      COGS?: number;
      ClosingValue?: number;
      ItemName?: string;
      VarianceValue?: number;
      TheoreticalUsageCost?: number;
      ActualUsage?: number;
      TheoreticalUsage?: number;
      UOM?: string;
    }>;
    ActualTheoCategoriesTotalsRows?: Array<{
      ActualUsage?: number;
      ActualUsagePercent?: number;
      TheoreticalUsage?: number;
      TheoreticalUsagePercent?: number;
      WasteValue?: number;
    }>;
  } | null;

  if (!Array.isArray(d?.ActualTheoDataRows)) {
    return {
      currentFoodCost: null,
      inventoryValue: null,
      wasteCost: null,
      foodCostPercent: null,
      theoreticalUsage: null,
      theoreticalUsagePercent: null,
      varianceItems: [],
      countPeriodStart: countStart,
      countPeriodEnd: countEnd,
    };
  }
  const categoryTotals = d.ActualTheoCategoriesTotalsRows;
  const hasCategoryTotals =
    Array.isArray(categoryTotals) && categoryTotals.length > 0;
  const firstCategory = hasCategoryTotals ? categoryTotals[0] : undefined;
  const currentFoodCost = roundTo2(
    firstCategory?.ActualUsage == null
      ? d.ActualTheoDataRows.reduce((s, row) => s + (Number(row.COGS) || 0), 0)
      : Number(firstCategory.ActualUsage),
  );
  const wasteCost =
    firstCategory?.WasteValue == null
      ? null
      : roundTo2(Number(firstCategory.WasteValue));
  const rawPercent = firstCategory?.ActualUsagePercent;
  const foodCostPercent =
    rawPercent == null ? null : roundTo2(Number(rawPercent) * 100);
  const theoreticalUsage =
    firstCategory?.TheoreticalUsage == null
      ? roundTo2(
          d.ActualTheoDataRows.reduce(
            (s, row) => s + (Number(row.TheoreticalUsageCost) || 0),
            0,
          ),
        )
      : roundTo2(Number(firstCategory.TheoreticalUsage));
  const rawTheoPercent = firstCategory?.TheoreticalUsagePercent;
  const theoreticalUsagePercent =
    rawTheoPercent == null ? null : roundTo2(Number(rawTheoPercent) * 100);
  const inventoryValue = roundTo2(
    d.ActualTheoDataRows.reduce(
      (s, row) => s + (Number(row.ClosingValue) || 0),
      0,
    ),
  );
  const varianceItems: ActualTheoValue["varianceItems"] =
    d.ActualTheoDataRows.map((row) => {
      const item: ActualTheoValue["varianceItems"][number] = {
        label: row.ItemName ?? "—",
        varianceCost: roundTo2(Number(row.VarianceValue) || 0),
      };
      if (row.COGS != null) item.actualCost = roundTo2(Number(row.COGS));
      if (row.TheoreticalUsageCost != null)
        item.theoreticalCost = roundTo2(Number(row.TheoreticalUsageCost));
      if (row.ActualUsage != null) item.actualQuantity = Number(row.ActualUsage);
      if (row.TheoreticalUsage != null)
        item.theoreticalQuantity = Number(row.TheoreticalUsage);
      if (row.UOM != null && String(row.UOM).trim() !== "")
        item.uom = String(row.UOM).trim();
      return item;
    });
  return {
    currentFoodCost,
    inventoryValue,
    wasteCost,
    foodCostPercent,
    theoreticalUsage,
    theoreticalUsagePercent,
    varianceItems,
    countPeriodStart: countStart,
    countPeriodEnd: countEnd,
  };
}

function emptyActualTheoValue(): ActualTheoValue {
  return {
    currentFoodCost: null,
    inventoryValue: null,
    wasteCost: null,
    foodCostPercent: null,
    theoreticalUsage: null,
    theoreticalUsagePercent: null,
    varianceItems: [],
    countPeriodStart: null,
    countPeriodEnd: null,
  };
}

/**
 * Resolve latest valid count start/end (same rules as live MarketMan flow) and fetch actual/theo.
 */
export async function fetchActualTheoForDefaultCountPeriod(
  buyerGuid: string,
  f: Pick<
    ActualTheoFetchers,
    "getValidCountDates" | "fetchActualTheoDataByDateRange"
  >,
): Promise<ActualTheoValue> {
  const validCountDates = await f.getValidCountDates(buyerGuid);
  if (!validCountDates) return emptyActualTheoValue();
  const countEnd: string | null = validCountDates.endDates.at(-1) ?? null;
  if (!countEnd) return emptyActualTheoValue();
  const startNotAfterEnd = validCountDates.startDates.filter((d) => d <= countEnd);
  const countStart: string | null =
    startNotAfterEnd.length > 0
      ? ([...startNotAfterEnd].sort((a, b) => (a < b ? -1 : 1)).at(-1) ?? null)
      : null;
  if (!countStart) return emptyActualTheoValue();
  return f.fetchActualTheoDataByDateRange(buyerGuid, countStart, countEnd);
}

/**
 * Build the actual/theo promise: either by date range (if valid override) or default count date.
 */
export async function buildActualTheoPromise(
  buyerGuid: string,
  countPeriodStart: string | undefined | null,
  countPeriodEnd: string | undefined | null,
  fetchers: ActualTheoFetchers,
): Promise<ActualTheoValue | null> {
  const hasCountPeriodOverride =
    countPeriodStart != null &&
    countPeriodEnd != null &&
    String(countPeriodStart).trim() !== "" &&
    String(countPeriodEnd).trim() !== "";

  if (!hasCountPeriodOverride) {
    return fetchActualTheoForDefaultCountPeriod(buyerGuid, fetchers);
  }

  const validCountDates = await fetchers.getValidCountDates(buyerGuid);
  const startNorm = String(countPeriodStart).trim().replaceAll("-", "/");
  const endNorm = String(countPeriodEnd).trim().replaceAll("-", "/");
  const startValid =
    validCountDates?.startDates.includes(startNorm) === true;
  const endValid =
    validCountDates?.endDates.includes(endNorm) === true;
  const orderValid = startNorm <= endNorm;

  if (validCountDates && startValid && endValid && orderValid) {
    return fetchers.fetchActualTheoDataByDateRange(buyerGuid, startNorm, endNorm);
  }
  return fetchActualTheoForDefaultCountPeriod(buyerGuid, fetchers);
}

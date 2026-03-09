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
  fetchActualTheoDataForCountDate: (buyerGuid: string) => Promise<ActualTheoValue>;
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
    return fetchers.fetchActualTheoDataForCountDate(buyerGuid);
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
  return fetchers.fetchActualTheoDataForCountDate(buyerGuid);
}

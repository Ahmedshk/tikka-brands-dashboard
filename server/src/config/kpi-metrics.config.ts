/**
 * Maps each KPI endpoint's page to metric IDs and their required permission component IDs.
 * Used by the backend to validate that the user's role has access to requested metrics.
 */

import type { RolePermissions } from "../types/rbac.types.js";
import { ForbiddenError } from "../utils/errors.util.js";

export type { RolePermissions } from "../types/rbac.types.js";

/** Parse metrics query (comma-separated string or array) to string[]. */
export function parseMetricsQuery(query: unknown): string[] | undefined {
  if (query == null) return undefined;
  if (Array.isArray(query)) {
    return query
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof query !== "string") return undefined;
  const s = query.trim();
  return s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined;
}

/** All component IDs per page (for applying removals when role has type 'all'). Must match client permission config. */
export const PAGE_COMPONENT_IDS: Record<string, string[]> = {
  "command-center": [
    "full-page",
    "net-sales-kpi",
    "labor-cost-kpi",
    "review-rating-kpi",
    "hourly-net-sales-chart",
    "labor-cost-percentage-gauge",
    "alerts-financial-labor",
    "alerts-inventory-supply-chain",
    "alerts-reputation-hr",
  ],
  "sales-labor-detail": [
    "full-page",
    "kpi-actual-total-net-sales",
    "kpi-actual-labor-cost",
    "kpi-total-hours",
    "kpi-sales-per-man-hour",
    "kpi-no-of-transactions",
    "kpi-average-check",
    "kpi-total-discounts",
    "kpi-total-refunds",
    "sources-of-sales",
  ],
  "inventory-food-cost": [
    "full-page",
    "kpi-current-food-cost",
    "kpi-inventory-value",
    "waste-cost",
    "kpi-pending-orders",
    "cost-of-goods-sold-gauge",
    "food-cost-variance",
  ],
};

/** All metric IDs for a page (for filtering response to allowed-only). */
export function getAllMetricIdsForPage(pageId: string): string[] {
  const map = KPI_METRIC_TO_COMPONENT_ID[pageId];
  return map ? Object.keys(map) : [];
}

/** For each page, metricId (API param) -> componentId (RBAC). */
export const KPI_METRIC_TO_COMPONENT_ID: Record<string, Record<string, string>> = {
  "command-center": {
    netSales: "net-sales-kpi",
    laborCost: "labor-cost-kpi",
    reviewRating: "review-rating-kpi",
  },
  "sales-labor-detail": {
    actualTotalSales: "kpi-actual-total-net-sales",
    actualLaborCostPercent: "kpi-actual-labor-cost",
    totalHours: "kpi-total-hours",
    salesPerManHour: "kpi-sales-per-man-hour",
    transactionCount: "kpi-no-of-transactions",
    averageCheck: "kpi-average-check",
    totalDiscounts: "kpi-total-discounts",
    totalRefunds: "kpi-total-refunds",
    sourcesOfSales: "sources-of-sales",
  },
  "inventory-food-cost": {
    currentFoodCost: "kpi-current-food-cost",
    inventoryValue: "kpi-inventory-value",
    wasteCost: "kpi-waste-cost",
    pendingOrdersCount: "kpi-pending-orders",
    foodCostPercent: "cost-of-goods-sold-gauge",
    theoreticalUsage: "cost-of-goods-sold-gauge",
    theoreticalUsagePercent: "cost-of-goods-sold-gauge",
    varianceItems: "food-cost-variance",
  },
};

const FULL_PAGE_COMPONENT_ID = "full-page";

function hasComponentAccess(
  components: string[] | undefined,
  componentId: string
): boolean {
  if (components == null) return true;
  if (components.length === 0) return false;
  if (components.includes(FULL_PAGE_COMPONENT_ID)) return true;
  return components.includes(componentId);
}

/**
 * Returns only the metric IDs the user is allowed to access for the given page.
 * If the user has no access to the page, returns [].
 */
export function filterAllowedMetrics(
  permissions: RolePermissions | undefined,
  pageId: string,
  metricIds: string[]
): string[] {
  if (!permissions) return [];
  if (!metricIds.length) return [];
  if (permissions.type === "all") return metricIds;

  const metricToComponent = KPI_METRIC_TO_COMPONENT_ID[pageId];
  if (!metricToComponent) return [];

  const pageEntry = permissions.pages?.find((p) => p.pageId === pageId);
  if (!pageEntry) return [];

  const DAILY_TARGETS_COMPONENT_ID = "daily-targets-vs-actual";
  const hasDailyTargets = hasComponentAccess(pageEntry.components, DAILY_TARGETS_COMPONENT_ID);

  return metricIds.filter((metricId) => {
    const componentId = metricToComponent[metricId];
    if (!componentId) return true;
    if (pageId === "inventory-food-cost" && metricId === "currentFoodCost") {
      // Cost of goods sold gauge shows "Actual Usage" ($) from currentFoodCost; allow if user has gauge or the KPI
      return (
        hasComponentAccess(pageEntry.components, "kpi-current-food-cost") ||
        hasComponentAccess(pageEntry.components, "cost-of-goods-sold-gauge")
      );
    }
    if (
      pageId === "sales-labor-detail" &&
      hasDailyTargets &&
      (metricId === "totalHours" || metricId === "salesPerManHour")
    ) {
      // Daily Targets vs Actual card needs these to show Hours Target and SPMH Target rows
      return true;
    }
    return hasComponentAccess(pageEntry.components, componentId);
  });
}

/**
 * Validates that the user's permissions allow access to every requested metric for the given page.
 * Throws ForbiddenError if any requested metric is not allowed.
 */
export function assertCanAccessMetrics(
  permissions: RolePermissions | undefined,
  pageId: string,
  metricIds: string[]
): void {
  if (!permissions) {
    throw new ForbiddenError("Insufficient permissions");
  }
  if (permissions.type === "all") return;
  if (!metricIds.length) return;

  const allowed = filterAllowedMetrics(permissions, pageId, metricIds);
  if (allowed.length !== metricIds.length) {
    throw new ForbiddenError("Insufficient permissions");
  }
}

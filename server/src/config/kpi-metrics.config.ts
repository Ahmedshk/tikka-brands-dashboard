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

  const metricToComponent = KPI_METRIC_TO_COMPONENT_ID[pageId];
  if (!metricToComponent) return;

  const pageEntry = permissions.pages?.find((p) => p.pageId === pageId);
  if (!pageEntry) {
    throw new ForbiddenError("Insufficient permissions");
  }

  for (const metricId of metricIds) {
    const componentId = metricToComponent[metricId];
    if (!componentId) continue;
    if (!hasComponentAccess(pageEntry.components, componentId)) {
      throw new ForbiddenError("Insufficient permissions");
    }
  }
}

import type { Request } from "express";
import type { PagePermission } from "../types/rbac.types.js";
import { getEffectivePagePermission } from "./permissions.util.js";
import { filterAllowedMetrics, getAllMetricIdsForPage, parseMetricsQuery, PAGE_COMPONENT_IDS } from "../config/kpi-metrics.config.js";

const INVENTORY_KPI_METRICS = [
  "currentFoodCost",
  "inventoryValue",
  "wasteCost",
  "pendingOrdersCount",
  "foodCostPercent",
  "theoreticalUsage",
  "theoreticalUsagePercent",
  "varianceItems",
] as const;

type InventoryMetric = (typeof INVENTORY_KPI_METRICS)[number];

export type InventoryKpiRequestInputs = {
  locationId: string;
  metrics: string[];
  pendingOrdersPeriod: "thisWeek" | "lastWeek";
  countPeriodStart?: string;
  countPeriodEnd?: string;
};

export type InventoryKpiRequestParseResult =
  | { kind: "bad_request"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "empty_ok" }
  | { kind: "ok"; inputs: InventoryKpiRequestInputs };

function getInventoryPageForRequest(req: Request): PagePermission | null {
  const user = req.user;
  if (user?.permissions == null) return null;

  return getEffectivePagePermission(
    user.permissions,
    user.permissionRemovals ?? null,
    "inventory-food-cost",
    PAGE_COMPONENT_IDS["inventory-food-cost"] ?? [],
    "Inventory & Food Cost",
    user.permissionOverrides ?? null,
  );
}

function resolveAllowedMetrics(req: Request): string[] {
  const effectivePage = getInventoryPageForRequest(req);
  if (!effectivePage) return [];

  const effectivePermissions = { type: "custom" as const, pages: [effectivePage] };
  const allMetricIds = getAllMetricIdsForPage("inventory-food-cost");
  return filterAllowedMetrics(effectivePermissions, "inventory-food-cost", allMetricIds);
}

function parseTrimmedStringParam(req: Request, key: string): string | undefined {
  const raw = (req.query as Record<string, unknown>)[key];
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t || undefined;
}

function parseLocationId(req: Request): string {
  return typeof req.query.locationId === "string" ? req.query.locationId : "";
}

function parsePendingOrdersPeriod(req: Request): "thisWeek" | "lastWeek" {
  if (req.query.pendingOrdersPeriod === "lastWeek") return "lastWeek";
  return "thisWeek";
}

function validateQueryMetrics(queryMetrics: string[]): string[] {
  const invalid = queryMetrics.filter(
    (m) => !INVENTORY_KPI_METRICS.includes(m as InventoryMetric),
  );
  return invalid;
}

export function parseInventoryKpiRequest(req: Request): InventoryKpiRequestParseResult {
  const locationId = parseLocationId(req);
  const allowedMetrics = resolveAllowedMetrics(req);
  const queryMetrics = parseMetricsQuery(req.query.metrics) ?? [];

  let metrics: string[];
  if (queryMetrics.length > 0) {
    const invalid = validateQueryMetrics(queryMetrics);
    if (invalid.length > 0) return { kind: "bad_request", message: "Invalid metric" };

    metrics = queryMetrics.filter((m) => allowedMetrics.includes(m));
    if (metrics.length === 0) {
      return { kind: "forbidden", message: "Insufficient permissions" };
    }
  } else {
    if (allowedMetrics.length === 0) return { kind: "empty_ok" };
    metrics = allowedMetrics;
  }

  const countPeriodStart = parseTrimmedStringParam(req, "countPeriodStart");
  const countPeriodEnd = parseTrimmedStringParam(req, "countPeriodEnd");

  return {
    kind: "ok",
    inputs: {
      locationId,
      metrics,
      pendingOrdersPeriod: parsePendingOrdersPeriod(req),
      ...(countPeriodStart == null ? {} : { countPeriodStart }),
      ...(countPeriodEnd == null ? {} : { countPeriodEnd }),
    },
  };
}


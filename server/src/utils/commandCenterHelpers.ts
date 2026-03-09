import type { Response } from "express";
import {
  assertCanAccessMetrics,
  type RolePermissions,
} from "../config/kpi-metrics.config.js";
import {
  COMMAND_CENTER_METRICS,
  PERIODS,
  type Period,
  type HourlySalesRow,
  type CommandCenterWantFlags,
} from "../types/commandCenter.types.js";
import { ForbiddenError } from "./errors.util.js";

export { COMMAND_CENTER_METRICS, PERIODS } from "../types/commandCenter.types.js";
export type { Period, HourlySalesRow } from "../types/commandCenter.types.js";

export function parsePeriodsQuery(periods: unknown): Period[] | undefined {
  if (periods == null) return undefined;
  let raw: string[];
  if (typeof periods === "string") {
    raw = periods.split(",").map((x) => x.trim());
  } else if (Array.isArray(periods)) {
    raw = periods.map(String).map((x) => x.trim());
  } else {
    raw = [];
  }
  const filtered = raw.filter((p): p is Period =>
    PERIODS.includes(p as Period),
  );
  return filtered.length > 0 ? filtered : undefined;
}

/**
 * Validates command-center metrics and RBAC. If invalid, sends 400/403 and returns false.
 */
export function validateCommandCenterMetrics(
  res: Response,
  permissions: unknown,
  metrics: string[] | undefined,
): boolean {
  if (!metrics?.length) return true;
  const invalid = metrics.filter(
    (m) =>
      !COMMAND_CENTER_METRICS.includes(
        m as (typeof COMMAND_CENTER_METRICS)[number],
      ),
  );
  if (invalid.length > 0) {
    res.status(400).json({ success: false, message: "Invalid metric" });
    return false;
  }
  try {
    assertCanAccessMetrics(permissions as RolePermissions | undefined, "command-center", metrics);
    return true;
  } catch (err) {
    if (err instanceof ForbiddenError) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return false;
    }
    throw err;
  }
}

export function getWantFlags(metrics: string[] | undefined): CommandCenterWantFlags {
  const wantNetSales = !metrics?.length || metrics.includes("netSales");
  const wantLaborCost = !metrics?.length || metrics.includes("laborCost");
  const wantReviewRating =
    !metrics?.length || metrics.includes("reviewRating");
  return { wantNetSales, wantLaborCost, wantReviewRating };
}

export function buildEmptyHourlySalesRows(): HourlySalesRow[] {
  return Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, "0")}:00`,
    today: null,
    last_week: 0,
  }));
}

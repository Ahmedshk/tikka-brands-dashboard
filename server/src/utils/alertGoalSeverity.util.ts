import type { IAlertMetricToggles } from "../types/alertNotification.types.js";

export type GoalAlertSeverity = "warning" | "critical" | null;

/** Lower actual is better (labor %, food %, hours). Tolerance is % of target: band is target × (1 + tol/100). */
export function classifyLowerIsBetter(
  actual: number | null,
  target: number,
  tolerance: number,
  toggles: IAlertMetricToggles,
): GoalAlertSeverity {
  if (actual == null || target <= 0) return null;
  if (actual <= target) return null;
  const tolPct = Math.max(0, tolerance);
  const bandMax = tolPct > 0 ? target * (1 + tolPct / 100) : target;
  const withinTol = tolPct > 0 && actual <= bandMax;
  if (withinTol && toggles.warnInToleranceZone) return "warning";
  if (!withinTol && toggles.alertBeyondTolerance) return "critical";
  if (withinTol && !toggles.warnInToleranceZone && toggles.alertBeyondTolerance) return null;
  return null;
}

/** Higher actual is better (sales, SPMH). Tolerance is % of target: band is target × (1 − tol/100). */
export function classifyHigherIsBetter(
  actual: number | null,
  target: number,
  tolerance: number,
  toggles: IAlertMetricToggles,
): GoalAlertSeverity {
  if (actual == null || target <= 0) return null;
  if (actual >= target) return null;
  const tolPct = Math.max(0, tolerance);
  const isUnfavorable = actual < target;
  const bandMin = tolPct > 0 ? target * (1 - tolPct / 100) : target;
  const withinTol = isUnfavorable && tolPct > 0 && actual >= bandMin;
  if (withinTol && toggles.warnInToleranceZone) return "warning";
  if (isUnfavorable && !withinTol && toggles.alertBeyondTolerance) return "critical";
  return null;
}

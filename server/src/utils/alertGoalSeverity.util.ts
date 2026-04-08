import type { IAlertMetricToggles } from "../types/alertNotification.types.js";

export type GoalAlertSeverity = "warning" | "critical" | null;

/** Lower actual is better (labor %, food %, hours). Tolerance band: goal .. goal+tol (percentage points for % metrics; same units for hours). */
export function classifyLowerIsBetter(
  actual: number | null,
  target: number,
  tolerance: number,
  toggles: IAlertMetricToggles,
): GoalAlertSeverity {
  if (actual == null || target <= 0) return null;
  if (actual <= target) return null;
  const tol = Math.max(0, tolerance);
  const withinTol = tol > 0 && actual <= target + tol;
  if (withinTol && toggles.warnInToleranceZone) return "warning";
  if (!withinTol && toggles.alertBeyondTolerance) return "critical";
  if (withinTol && !toggles.warnInToleranceZone && toggles.alertBeyondTolerance) return null;
  return null;
}

/** Higher actual is better (sales, SPMH). Matches DailyTargetsCard: within tolerance if actual >= target - tol. */
export function classifyHigherIsBetter(
  actual: number | null,
  target: number,
  tolerance: number,
  toggles: IAlertMetricToggles,
): GoalAlertSeverity {
  if (actual == null || target <= 0) return null;
  if (actual >= target) return null;
  const tol = Math.max(0, tolerance);
  const isUnfavorable = actual < target;
  const withinTol = isUnfavorable && tol > 0 && actual >= target - tol;
  if (withinTol && toggles.warnInToleranceZone) return "warning";
  if (isUnfavorable && !withinTol && toggles.alertBeyondTolerance) return "critical";
  return null;
}

import type { Request } from "express";
import type {
  IGoal,
  IGoalValues,
  IGoalSetting,
  IFutureWeekGoals,
  DayOfWeek,
} from "../types/goal.types.js";
import { getEffectivePagePermission } from "./permissions.util.js";

/** Same shape as `GoalDailyActualsRow` in goalDailyActuals.service (avoid circular imports). */
type GoalDailyActualsRow = {
  actualSales: number | null;
  actualLaborCostPercent: number | null;
  actualHours: number | null;
  actualSalesPerManHour: number | null;
  actualFoodCostPercent: number | null;
};

/** Must match client `permissions.config.ts` goal-setting components. */
export const GOAL_SETTING_PAGE_ID = "goal-setting";

const GOAL_SETTING_PAGE_COMPONENT_IDS: string[] = [
  "full-page",
  "sales-goal",
  "labor-cost-pct-goal",
  "hours-goal",
  "spmh-goal",
  "food-cost-pct-goal",
];

export type GoalMetricKey =
  | "salesGoal"
  | "laborCostGoal"
  | "hoursGoal"
  | "spmhGoal"
  | "foodCostGoal";

const METRIC_KEYS: GoalMetricKey[] = [
  "salesGoal",
  "laborCostGoal",
  "hoursGoal",
  "spmhGoal",
  "foodCostGoal",
];

const COMPONENT_TO_METRIC: Record<string, GoalMetricKey> = {
  "sales-goal": "salesGoal",
  "labor-cost-pct-goal": "laborCostGoal",
  "hours-goal": "hoursGoal",
  "spmh-goal": "spmhGoal",
  "food-cost-pct-goal": "foodCostGoal",
};

const METRIC_TO_TOLERANCE: Record<GoalMetricKey, keyof IGoalValues> = {
  salesGoal: "salesGoalTolerance",
  laborCostGoal: "laborCostGoalTolerance",
  hoursGoal: "hoursGoalTolerance",
  spmhGoal: "spmhGoalTolerance",
  foodCostGoal: "foodCostGoalTolerance",
};

/** Component IDs for actuals rows (aligned with GoalDailyActualsRow fields). */
const METRIC_TO_ACTUAL_FIELD: Record<
  GoalMetricKey,
  keyof GoalDailyActualsRow
> = {
  salesGoal: "actualSales",
  laborCostGoal: "actualLaborCostPercent",
  hoursGoal: "actualHours",
  spmhGoal: "actualSalesPerManHour",
  foodCostGoal: "actualFoodCostPercent",
};

/**
 * `null` = no filtering (user sees all metrics).
 * `[]` = no metric keys allowed (strip all goal-related numeric fields).
 * Non-empty = only these metric keys (plus their tolerances / actuals when applicable).
 */
export function getAllowedGoalMetricKeys(req: Request): GoalMetricKey[] | null {
  const perms = req.user?.permissions;
  if (perms == null) return null;

  const effective = getEffectivePagePermission(
    perms,
    req.user?.permissionRemovals ?? null,
    GOAL_SETTING_PAGE_ID,
    GOAL_SETTING_PAGE_COMPONENT_IDS,
    "Goal Setting",
    req.user?.permissionOverrides ?? null,
  );

  if (effective == null || effective.components == null || effective.components.length === 0) {
    return [];
  }

  const ids = effective.components;
  if (ids.includes("full-page")) return null;

  const keys = new Set<GoalMetricKey>();
  for (const id of ids) {
    const m = COMPONENT_TO_METRIC[id];
    if (m != null) keys.add(m);
  }
  return Array.from(keys);
}

function stripGoalValuesInPlace<T extends Record<string, unknown>>(obj: T, allowed: GoalMetricKey[] | null): T {
  if (allowed == null) return obj;
  for (const m of METRIC_KEYS) {
    if (!allowed.includes(m)) {
      delete obj[m];
      const tol = METRIC_TO_TOLERANCE[m];
      delete obj[tol];
    }
  }
  return obj;
}

export function sanitizeGoalValues(
  values: IGoalValues,
  allowed: GoalMetricKey[] | null,
): IGoalValues {
  if (allowed == null) return values;
  const out = { ...values };
  return stripGoalValuesInPlace(out, allowed) as IGoalValues;
}

export function sanitizeGoalDocument(goal: IGoal, allowed: GoalMetricKey[] | null): IGoal {
  if (allowed == null) return goal;
  const out = { ...goal } as Record<string, unknown>;
  stripGoalValuesInPlace(out, allowed);
  return out as IGoal;
}

export function sanitizeGoalSetting(setting: IGoalSetting, allowed: GoalMetricKey[] | null): IGoalSetting {
  if (allowed == null) return setting;
  const weekly: IGoalSetting["weekly"] = {};
  for (const [dayStr, dayVals] of Object.entries(setting.weekly)) {
    if (dayVals == null) continue;
    weekly[Number(dayStr) as DayOfWeek] = sanitizeGoalValues(dayVals, allowed);
  }
  const futureWeeks: IFutureWeekGoals[] = setting.futureWeeks.map((w) => ({
    weekStartDate: w.weekStartDate,
    days: Object.fromEntries(
      Object.entries(w.days).map(([d, v]) => [
        d,
        v != null ? sanitizeGoalValues(v, allowed) : v,
      ]),
    ) as IFutureWeekGoals["days"],
  }));
  const defaultHistory =
    setting.defaultHistory?.map((row) => ({
      ...row,
      values: sanitizeGoalValues(row.values, allowed),
    })) ?? undefined;
  return {
    ...setting,
    default: sanitizeGoalValues(setting.default, allowed),
    weekly,
    futureWeeks,
    ...(defaultHistory != null ? { defaultHistory } : {}),
  };
}

export function sanitizeResolvedGoalResult(
  result: { goals: IGoal; source: string; defaultSnapshotEffectiveFrom?: string },
  allowed: GoalMetricKey[] | null,
): typeof result {
  if (allowed == null) return result;
  return {
    ...result,
    goals: sanitizeGoalDocument(result.goals, allowed),
  };
}

/**
 * Returns per-date actuals including only metrics the user may see (Goal Setting RBAC).
 * Disallowed fields are omitted from each date object (not null), so they are not in the JSON payload.
 */
export function sanitizeGoalDailyActualsByDate(
  actualsByDate: Record<string, GoalDailyActualsRow>,
  allowed: GoalMetricKey[] | null,
): Record<string, Partial<GoalDailyActualsRow>> {
  if (allowed == null) {
    return actualsByDate as Record<string, Partial<GoalDailyActualsRow>>;
  }
  const out: Record<string, Partial<GoalDailyActualsRow>> = {};
  for (const [date, row] of Object.entries(actualsByDate)) {
    const copy: Partial<GoalDailyActualsRow> = {};
    for (const m of METRIC_KEYS) {
      if (allowed.includes(m)) {
        const field = METRIC_TO_ACTUAL_FIELD[m];
        copy[field] = row[field];
      }
    }
    out[date] = copy;
  }
  return out;
}

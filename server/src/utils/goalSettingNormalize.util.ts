import type {
  IFutureWeekGoals,
  IGoalValues,
  IDefaultGoalHistoryEntry,
  DayOfWeek,
} from "../types/goal.types.js";

export const GOAL_VALUES_BASELINE: IGoalValues = {
  salesGoal: 0,
  laborCostGoal: 0,
  hoursGoal: 0,
  spmhGoal: 0,
  foodCostGoal: 0,
  salesGoalTolerance: 0,
  laborCostGoalTolerance: 0,
  hoursGoalTolerance: 0,
  spmhGoalTolerance: 0,
  foodCostGoalTolerance: 0,
};

/** Merge partial/null goal values onto baseline defaults. */
export function mergeGoalValuesWithBaseline(
  values: IGoalValues | null | undefined,
  baseline: IGoalValues = GOAL_VALUES_BASELINE,
): IGoalValues {
  return { ...baseline, ...(values ?? {}) };
}

export function normalizeWeekly(
  weekly: Partial<Record<DayOfWeek, IGoalValues>> | null | undefined,
): Partial<Record<DayOfWeek, IGoalValues>> {
  return weekly ?? {};
}

type DefaultHistoryInput = {
  effectiveFrom: string;
  values?: IGoalValues | null;
};

/** Coerce history rows so `values` is always a full goal object. */
export function normalizeDefaultHistory(
  history: DefaultHistoryInput[] | null | undefined,
  baseline: IGoalValues = GOAL_VALUES_BASELINE,
): IDefaultGoalHistoryEntry[] {
  return (history ?? [])
    .filter(
      (row): row is DefaultHistoryInput =>
        row != null && typeof row.effectiveFrom === "string" && row.effectiveFrom.trim() !== "",
    )
    .map((row) => ({
      effectiveFrom: row.effectiveFrom,
      values: mergeGoalValuesWithBaseline(row.values, baseline),
    }));
}

type FutureWeekInput = {
  weekStartDate: string;
  days?: Partial<Record<DayOfWeek, IGoalValues>> | null;
};

/** Ensure every future week has a `days` object and valid `weekStartDate`. */
export function normalizeFutureWeeks(
  futureWeeks: FutureWeekInput[] | null | undefined,
): IFutureWeekGoals[] {
  return (futureWeeks ?? [])
    .filter(
      (week): week is FutureWeekInput =>
        week != null &&
        typeof week.weekStartDate === "string" &&
        week.weekStartDate.trim() !== "",
    )
    .map((week) => ({
      weekStartDate: week.weekStartDate,
      days: week.days ?? {},
    }));
}

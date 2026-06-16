import type { GoalValues, GoalDayOfWeek, FutureWeekGoals } from '../types';
import {
  DEFAULT_GOAL_VALUES,
  FIELDS,
  GOAL_FIELD_KEYS,
  type GoalValueKey,
} from './goalSettingHelpers';
import { canAccessComponent } from '../config/permissions.config';
import type { RolePermissions } from '../types/rbac.types';

export const GOAL_SETTING_PAGE_ID = 'goal-setting';

export const GOAL_VALUE_KEY_TO_COMPONENT_ID: Record<GoalValueKey, string> = {
  salesGoal: 'sales-goal',
  laborCostGoal: 'labor-cost-pct-goal',
  hoursGoal: 'hours-goal',
  spmhGoal: 'spmh-goal',
  foodCostGoal: 'food-cost-pct-goal',
};

/** Goal value keys the user may view or edit on Goal Setting (from RBAC components). */
export function getAllowedGoalValueKeys(
  permissions: RolePermissions | undefined
): Set<GoalValueKey> {
  const allowed = new Set<GoalValueKey>();
  if (!permissions) {
    GOAL_FIELD_KEYS.forEach((k) => allowed.add(k));
    return allowed;
  }
  for (const key of GOAL_FIELD_KEYS) {
    const componentId = GOAL_VALUE_KEY_TO_COMPONENT_ID[key];
    if (canAccessComponent(permissions, GOAL_SETTING_PAGE_ID, componentId)) {
      allowed.add(key);
    }
  }
  return allowed;
}

/**
 * For save: keep baseline values for goal metrics the user cannot edit; apply `current` only for allowed keys.
 */
export function mergeGoalValuesForSave(
  current: GoalValues,
  baseline: GoalValues,
  allowed: ReadonlySet<GoalValueKey>
): GoalValues {
  const next = { ...baseline };
  for (const row of FIELDS) {
    if (allowed.has(row.key)) {
      next[row.key] = current[row.key];
      next[row.toleranceKey] =
        Number(current[row.toleranceKey] ?? baseline[row.toleranceKey] ?? 0);
    }
  }
  return next;
}

export function mergeWeeklyForSave(
  weekly: Partial<Record<GoalDayOfWeek, GoalValues>>,
  savedWeekly: Partial<Record<GoalDayOfWeek, GoalValues>> | undefined,
  allowed: ReadonlySet<GoalValueKey>
): Partial<Record<GoalDayOfWeek, GoalValues>> {
  const out: Partial<Record<GoalDayOfWeek, GoalValues>> = {};
  for (const dayStr of Object.keys(weekly)) {
    const day = Number(dayStr) as GoalDayOfWeek;
    const cur = weekly[day];
    if (!cur) continue;
    const baseline = { ...DEFAULT_GOAL_VALUES, ...savedWeekly?.[day] };
    out[day] = mergeGoalValuesForSave(cur, baseline, allowed);
  }
  return out;
}

export function mergeFutureWeeksForSave(
  futureWeeks: FutureWeekGoals[],
  savedFutureWeeks: FutureWeekGoals[] | undefined,
  allowed: ReadonlySet<GoalValueKey>
): FutureWeekGoals[] {
  return futureWeeks.map((week) => {
    const savedWeek = savedFutureWeeks?.find((w) => w.weekStartDate === week.weekStartDate);
    const weekDays = week.days ?? {};
    const days: Partial<Record<GoalDayOfWeek, GoalValues>> = { ...weekDays };
    for (const dayStr of Object.keys(weekDays)) {
      const day = Number(dayStr) as GoalDayOfWeek;
      const cur = weekDays[day];
      if (!cur) continue;
      const baseline = { ...DEFAULT_GOAL_VALUES, ...savedWeek?.days?.[day] };
      days[day] = mergeGoalValuesForSave(cur, baseline, allowed);
    }
    return { ...week, days };
  });
}

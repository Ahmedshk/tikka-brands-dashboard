import type { GoalValues, Goal, GoalDailyActuals } from '../types';
import type { GoalValueKey } from './goalSettingHelpers';

export function formatGoalMetricValue(key: GoalValueKey, value: number): string {
  if (key === 'laborCostGoal' || key === 'foodCostGoal') {
    return `${Number(value).toFixed(2)}%`;
  }
  if (key === 'salesGoal' || key === 'spmhGoal') {
    return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (key === 'hoursGoal') {
    return `${Number(value).toFixed(2)} hrs`;
  }
  return String(value);
}

export function formatTolerancePercent(goal: Goal | null, toleranceKey: keyof GoalValues): string {
  if (goal == null) return '—';
  const val = goal[toleranceKey];
  if (typeof val !== 'number') return '—';
  return `${Number(val).toFixed(2)}%`;
}

const ACTUAL_FIELD_BY_GOAL_KEY: Record<GoalValueKey, keyof GoalDailyActuals> = {
  salesGoal: 'actualSales',
  laborCostGoal: 'actualLaborCostPercent',
  hoursGoal: 'actualHours',
  spmhGoal: 'actualSalesPerManHour',
  foodCostGoal: 'actualFoodCostPercent',
};

/**
 * Single-line display for the actual value under a goal field; "—" when missing.
 */
export function formatActualForGoalField(
  key: GoalValueKey,
  actuals: GoalDailyActuals | null | undefined
): string {
  if (actuals == null) return '—';
  const field = ACTUAL_FIELD_BY_GOAL_KEY[key];
  const raw = actuals[field];
  if (raw == null || typeof raw !== 'number' || !Number.isFinite(raw)) {
    return '—';
  }
  return formatGoalMetricValue(key, raw);
}

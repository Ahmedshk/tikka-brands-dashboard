import type { GoalValues, Goal, GoalDailyActuals } from '../types';
import type { GoalValueKey } from './goalSettingHelpers';
import { TREND_NEGATIVE, TREND_PENDING, TREND_POSITIVE } from '../constants/trendColors';

const ACTUAL_FIELD_BY_GOAL_KEY: Record<GoalValueKey, keyof GoalDailyActuals> = {
  salesGoal: 'actualSales',
  laborCostGoal: 'actualLaborCostPercent',
  hoursGoal: 'actualHours',
  spmhGoal: 'actualSalesPerManHour',
  foodCostGoal: 'actualFoodCostPercent',
};

/** Goal tolerances are stored as % of target (same as alerts): band is target × (1 ± tol/100). */
const HIGHER_IS_BETTER: Record<GoalValueKey, boolean> = {
  salesGoal: true,
  laborCostGoal: false,
  hoursGoal: false,
  spmhGoal: true,
  foodCostGoal: false,
};

export type GoalVsActualTrend = 'positive' | 'pending' | 'negative' | 'unknown';

function readActual(key: GoalValueKey, actuals: GoalDailyActuals | null | undefined): number | null {
  if (actuals == null) return null;
  const field = ACTUAL_FIELD_BY_GOAL_KEY[key];
  const raw = actuals[field];
  if (raw == null || typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return raw;
}

function readTargetAndTolerance(
  goalKey: GoalValueKey,
  toleranceKey: keyof GoalValues,
  goalValues: Goal | GoalValues | null | undefined,
): { target: number; tolerance: number } {
  if (goalValues == null) return { target: 0, tolerance: 0 };
  const t = goalValues[goalKey];
  const tolRaw = goalValues[toleranceKey];
  const target = typeof t === 'number' && Number.isFinite(t) ? t : 0;
  const tolerance = typeof tolRaw === 'number' && Number.isFinite(tolRaw) ? tolRaw : 0;
  return { target, tolerance };
}

/**
 * On-track (positive), caution inside relative tolerance % (pending), needs attention (negative).
 * `tolerance` is a percentage of target (e.g. 5 = within 5% below/above target depending on direction).
 */
export function classifyGoalVsActualTrend(
  goalKey: GoalValueKey,
  toleranceKey: keyof GoalValues,
  goalValues: Goal | GoalValues | null | undefined,
  actuals: GoalDailyActuals | null | undefined,
): GoalVsActualTrend {
  const actual = readActual(goalKey, actuals);
  if (actual == null) return 'unknown';
  const { target, tolerance } = readTargetAndTolerance(goalKey, toleranceKey, goalValues);
  const higherIsBetter = HIGHER_IS_BETTER[goalKey];
  const tolPct = Math.max(0, tolerance);
  const isUnfavorable = higherIsBetter ? actual < target : actual > target;
  const tolFrac = tolPct / 100;
  let withinTolerance = false;
  if (isUnfavorable && tolPct > 0 && target > 0) {
    if (higherIsBetter) {
      const bandMin = target * (1 - tolFrac);
      withinTolerance = actual >= bandMin;
    } else {
      const bandMax = target * (1 + tolFrac);
      withinTolerance = actual <= bandMax;
    }
  }
  if (withinTolerance) return 'pending';
  if (isUnfavorable) return 'negative';
  return 'positive';
}

/**
 * Percent difference vs target: ((actual - target) / target) * 100. Null if target is 0 or actual missing.
 */
export function percentDiffVsGoalTarget(
  goalKey: GoalValueKey,
  goalValues: Goal | GoalValues | null | undefined,
  actuals: GoalDailyActuals | null | undefined,
): number | null {
  const actual = readActual(goalKey, actuals);
  if (actual == null) return null;
  const t = goalValues?.[goalKey];
  const target = typeof t === 'number' && Number.isFinite(t) ? t : 0;
  if (target === 0) return null;
  return ((actual - target) / target) * 100;
}

export function trendToDisplayColor(trend: GoalVsActualTrend): string | undefined {
  switch (trend) {
    case 'positive':
      return TREND_POSITIVE;
    case 'pending':
      return TREND_PENDING;
    case 'negative':
      return TREND_NEGATIVE;
    default:
      return undefined;
  }
}

export function formatSignedPercentDiff(pct: number): string {
  const rounded = Math.round(pct * 100) / 100;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(2)}%`;
}

import { getTodayInTimezone } from '../services/goal.service';
import type { GoalValues, GoalDayOfWeek, FutureWeekGoals, GoalSetting } from '../types';

export type { FutureWeekGoals, GoalDayOfWeek, GoalValues } from '../types';

export const DEFAULT_GOAL_VALUES: GoalValues = {
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

export const GOAL_FIELD_KEYS = [
  'salesGoal',
  'laborCostGoal',
  'hoursGoal',
  'spmhGoal',
  'foodCostGoal',
] as const;

export type GoalValueKey = (typeof GOAL_FIELD_KEYS)[number];

export const FIELDS: {
  key: GoalValueKey;
  toleranceKey: keyof GoalValues;
  label: string;
  unit?: 'prefix' | 'suffix';
  unitChar?: string;
}[] = [
  { key: 'salesGoal', toleranceKey: 'salesGoalTolerance', label: 'Sales Goal', unit: 'prefix', unitChar: '$' },
  { key: 'laborCostGoal', toleranceKey: 'laborCostGoalTolerance', label: 'Labor cost % Goal', unit: 'suffix', unitChar: '%' },
  { key: 'hoursGoal', toleranceKey: 'hoursGoalTolerance', label: 'Hours Goal', unit: 'suffix', unitChar: ' hrs' },
  { key: 'spmhGoal', toleranceKey: 'spmhGoalTolerance', label: 'SPMH Goal', unit: 'prefix', unitChar: '$' },
  { key: 'foodCostGoal', toleranceKey: 'foodCostGoalTolerance', label: 'Food cost % Goal', unit: 'suffix', unitChar: '%' },
];

export const DAY_NAMES: Record<GoalDayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export const DAY_ORDER: GoalDayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

export type TabId = 'default' | 'weekly' | 'future' | 'previous';

/** Ensure every future week has a `days` object (API may omit or null it on legacy docs). */
export function normalizeFutureWeeks(
  futureWeeks: FutureWeekGoals[] | null | undefined
): FutureWeekGoals[] {
  return (futureWeeks ?? [])
    .filter(
      (week): week is FutureWeekGoals =>
        week != null &&
        typeof week.weekStartDate === 'string' &&
        week.weekStartDate.trim() !== ''
    )
    .map((week) => ({
      weekStartDate: week.weekStartDate,
      days: week.days ?? {},
    }));
}

/** Normalize API goal setting for client state and saved snapshots. */
export function normalizeGoalSettingSnapshot(setting: GoalSetting): GoalSetting {
  return {
    ...setting,
    weekly: setting.weekly ?? {},
    futureWeeks: normalizeFutureWeeks(setting.futureWeeks),
  };
}

/** Merge partial goal values onto defaults (weekly/future day rows may omit unset metrics). */
export function mergeGoalValuesWithDefaults(
  values: Partial<GoalValues> | null | undefined
): GoalValues {
  return { ...DEFAULT_GOAL_VALUES, ...(values ?? {}) };
}

export function goalValuesEqual(
  a: Partial<GoalValues> | null | undefined,
  b: Partial<GoalValues> | null | undefined
): boolean {
  const na = mergeGoalValuesWithDefaults(a);
  const nb = mergeGoalValuesWithDefaults(b);
  return (
    na.salesGoal === nb.salesGoal &&
    na.laborCostGoal === nb.laborCostGoal &&
    na.hoursGoal === nb.hoursGoal &&
    na.spmhGoal === nb.spmhGoal &&
    na.foodCostGoal === nb.foodCostGoal &&
    na.salesGoalTolerance === nb.salesGoalTolerance &&
    na.laborCostGoalTolerance === nb.laborCostGoalTolerance &&
    na.hoursGoalTolerance === nb.hoursGoalTolerance &&
    na.spmhGoalTolerance === nb.spmhGoalTolerance &&
    na.foodCostGoalTolerance === nb.foodCostGoalTolerance
  );
}

/** True when form state matches the last loaded/saved snapshot (no user edits). */
export function goalSettingFormEquals(
  form: {
    defaultGoals: GoalValues;
    weekly: Partial<Record<GoalDayOfWeek, GoalValues>>;
    futureWeeks: FutureWeekGoals[];
  },
  saved: GoalSetting | null
): boolean {
  if (!saved) {
    return (
      goalValuesEqual(form.defaultGoals, DEFAULT_GOAL_VALUES) &&
      Object.keys(form.weekly).length === 0 &&
      form.futureWeeks.length === 0
    );
  }
  return (
    goalValuesEqual(form.defaultGoals, saved.default) &&
    weeklyEqual(form.weekly, saved.weekly ?? {}) &&
    futureWeeksEqual(form.futureWeeks, saved.futureWeeks ?? [])
  );
}

export function weeklyEqual(
  a: Partial<Record<GoalDayOfWeek, GoalValues>>,
  b: Partial<Record<GoalDayOfWeek, GoalValues>>
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].map(Number));
  for (const k of keys) {
    const ak = a[k as GoalDayOfWeek];
    const bk = b[k as GoalDayOfWeek];
    if ((ak == null) !== (bk == null)) return false;
    if (ak != null && bk != null && !goalValuesEqual(ak, bk)) return false;
  }
  return true;
}

export function futureWeeksEqual(a: FutureWeekGoals[], b: FutureWeekGoals[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    if (ai == null || bi == null) return false;
    if (ai.weekStartDate !== bi.weekStartDate) return false;
    if (!weeklyEqual(ai.days ?? {}, bi.days ?? {})) return false;
  }
  return true;
}

export function getSundayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

/** Format YYYY-MM-DD as mm/dd/yyyy */
export function formatDateMmDdYyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m ?? ''}/${d ?? ''}/${y ?? ''}`;
}

/** Add days to YYYY-MM-DD, return YYYY-MM-DD */
export function addDaysToDate(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number);
  const y = parts[0] ?? 0;
  const m = (parts[1] ?? 1) - 1;
  const d = (parts[2] ?? 1) + days;
  const date = new Date(y, m, d);
  const oy = date.getFullYear();
  const om = String(date.getMonth() + 1).padStart(2, '0');
  const od = String(date.getDate()).padStart(2, '0');
  return `${oy}-${om}-${od}`;
}

/** Get Sunday (week start) of current week in timezone as YYYY-MM-DD */
export function getCurrentWeekStartInTimezone(timezone: string): string {
  const todayStr = getTodayInTimezone(timezone);
  const parts = todayStr.split('-').map(Number);
  const y = parts[0] ?? 0;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  const date = new Date(Date.UTC(y, m, d));
  const dayOfWeek = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - dayOfWeek);
  const sy = date.getUTCFullYear();
  const sm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const sd = String(date.getUTCDate()).padStart(2, '0');
  return `${sy}-${sm}-${sd}`;
}

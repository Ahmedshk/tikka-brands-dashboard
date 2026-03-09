import { getTodayInTimezone } from '../services/goal.service';
import type { GoalValues, GoalDayOfWeek, FutureWeekGoals } from '../types';

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

export function goalValuesEqual(a: GoalValues, b: GoalValues): boolean {
  return (
    Number(a.salesGoal) === Number(b.salesGoal) &&
    Number(a.laborCostGoal) === Number(b.laborCostGoal) &&
    Number(a.hoursGoal) === Number(b.hoursGoal) &&
    Number(a.spmhGoal) === Number(b.spmhGoal) &&
    Number(a.foodCostGoal) === Number(b.foodCostGoal) &&
    Number(a.salesGoalTolerance ?? 0) === Number(b.salesGoalTolerance ?? 0) &&
    Number(a.laborCostGoalTolerance ?? 0) === Number(b.laborCostGoalTolerance ?? 0) &&
    Number(a.hoursGoalTolerance ?? 0) === Number(b.hoursGoalTolerance ?? 0) &&
    Number(a.spmhGoalTolerance ?? 0) === Number(b.spmhGoalTolerance ?? 0) &&
    Number(a.foodCostGoalTolerance ?? 0) === Number(b.foodCostGoalTolerance ?? 0)
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

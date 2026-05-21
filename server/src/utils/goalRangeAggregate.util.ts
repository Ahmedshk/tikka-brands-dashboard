/**
 * Helpers for aggregating per-day resolved goals across a date range.
 *
 * Aggregation rules — matched to how the Sales & Labor Detail page consumes
 * the result (a single Goal object the existing card builder can read):
 *   - salesGoal, hoursGoal: SUM across days (they are daily targets and roll up
 *     additively over the period).
 *   - laborCostGoal (%), spmhGoal ($/hr), foodCostGoal (%): AVERAGE across
 *     days (rates, not totals).
 *   - tolerances: AVERAGE across days (kept in the same units as the goal
 *     they apply to).
 */
import type { IGoal, IGoalValues } from "../types/goal.types.js";

/** Enumerate every YYYY-MM-DD between start and end (inclusive). */
export function enumerateDateRange(startYmd: string, endYmd: string): string[] {
  const parse = (s: string): { y: number; m0: number; d: number } | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    return {
      y: Number.parseInt(m[1]!, 10),
      m0: Number.parseInt(m[2]!, 10) - 1,
      d: Number.parseInt(m[3]!, 10),
    };
  };
  const fmt = (p: { y: number; m0: number; d: number }): string =>
    `${p.y}-${String(p.m0 + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  const addDays = (p: { y: number; m0: number; d: number }, n: number) => {
    const x = new Date(Date.UTC(p.y, p.m0, p.d + n));
    return { y: x.getUTCFullYear(), m0: x.getUTCMonth(), d: x.getUTCDate() };
  };
  const s = parse(startYmd);
  const e = parse(endYmd);
  if (!s || !e) return [];
  const out: string[] = [];
  let cur = s;
  // Hard cap at 400 days (≥ last52weeks) to avoid runaway loops on bad input.
  for (let i = 0; i < 400; i++) {
    out.push(fmt(cur));
    if (cur.y === e.y && cur.m0 === e.m0 && cur.d === e.d) break;
    if (cur.y > e.y || (cur.y === e.y && cur.m0 > e.m0) ||
        (cur.y === e.y && cur.m0 === e.m0 && cur.d > e.d)) {
      break;
    }
    cur = addDays(cur, 1);
  }
  return out;
}

/**
 * Aggregate a single location's per-day goals into one IGoal for the period.
 * salesGoal/hoursGoal are summed; rate-based goals and tolerances are averaged.
 */
export function aggregatePerDayGoals(locationId: string, goals: IGoal[]): IGoal {
  if (goals.length === 0) {
    return {
      locationId,
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
  }
  const n = goals.length;
  const sum = (key: keyof IGoalValues): number =>
    goals.reduce((acc, g) => acc + (Number(g[key] ?? 0) || 0), 0);
  const avg = (key: keyof IGoalValues): number => sum(key) / n;
  return {
    locationId,
    salesGoal: sum("salesGoal"),
    hoursGoal: sum("hoursGoal"),
    laborCostGoal: avg("laborCostGoal"),
    spmhGoal: avg("spmhGoal"),
    foodCostGoal: avg("foodCostGoal"),
    salesGoalTolerance: avg("salesGoalTolerance"),
    laborCostGoalTolerance: avg("laborCostGoalTolerance"),
    hoursGoalTolerance: avg("hoursGoalTolerance"),
    spmhGoalTolerance: avg("spmhGoalTolerance"),
    foodCostGoalTolerance: avg("foodCostGoalTolerance"),
  };
}

/** Average per-location aggregated goals into a single representative goal (matches all-locations single-day behavior). */
export function averageGoalsAcrossLocations(
  representativeLocationId: string,
  perLocation: IGoal[],
): IGoal {
  if (perLocation.length === 0) {
    return {
      locationId: representativeLocationId,
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
  }
  const n = perLocation.length;
  const avg = (key: keyof IGoalValues): number =>
    perLocation.reduce((acc, g) => acc + (Number(g[key] ?? 0) || 0), 0) / n;
  return {
    locationId: representativeLocationId,
    salesGoal: avg("salesGoal"),
    laborCostGoal: avg("laborCostGoal"),
    hoursGoal: avg("hoursGoal"),
    spmhGoal: avg("spmhGoal"),
    foodCostGoal: avg("foodCostGoal"),
    salesGoalTolerance: avg("salesGoalTolerance"),
    laborCostGoalTolerance: avg("laborCostGoalTolerance"),
    hoursGoalTolerance: avg("hoursGoalTolerance"),
    spmhGoalTolerance: avg("spmhGoalTolerance"),
    foodCostGoalTolerance: avg("foodCostGoalTolerance"),
  };
}

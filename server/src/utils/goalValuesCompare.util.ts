import type { IGoalValues } from "../types/goal.types.js";

/** Deep equality for goal value objects (five goals + tolerances). */
export function goalValuesEqual(a: IGoalValues, b: IGoalValues): boolean {
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

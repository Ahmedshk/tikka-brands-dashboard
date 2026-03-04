/** The five numeric goal values and their tolerance % (shared shape). */
export interface IGoalValues {
  salesGoal: number;
  laborCostGoal: number;
  hoursGoal: number;
  spmhGoal: number;
  foodCostGoal: number;
  salesGoalTolerance?: number;
  laborCostGoalTolerance?: number;
  hoursGoalTolerance?: number;
  spmhGoalTolerance?: number;
  foodCostGoalTolerance?: number;
}

/** Resolved goal for a single date (API response for consumers). */
export interface IGoal extends IGoalValues {
  _id?: string;
  locationId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Source of the resolved goal for a date. */
export type GoalSource = "default" | "weekly" | "futureWeek";

/** Response when fetching resolved goal for a date (includes source). */
export interface IResolvedGoalResult {
  goals: IGoal;
  source: GoalSource;
}

/** Day-of-week index: 0 = Sunday, 6 = Saturday. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** One future week override: week start (Sunday) and optional goals per day. */
export interface IFutureWeekGoals {
  weekStartDate: string; // YYYY-MM-DD (Sunday)
  days: Partial<Record<DayOfWeek, IGoalValues>>;
}

/** Full goal setting document (for editing: default + weekly + future weeks). */
export interface IGoalSetting {
  locationId: string;
  default: IGoalValues;
  weekly: Partial<Record<DayOfWeek, IGoalValues>>;
  futureWeeks: IFutureWeekGoals[];
}

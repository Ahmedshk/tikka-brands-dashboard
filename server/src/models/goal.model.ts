import mongoose, { Schema, Document, Types } from "mongoose";
import type { IGoalValues, DayOfWeek } from "../types/goal.types.js";

const goalValuesSchema = new Schema<IGoalValues>(
  {
    salesGoal: { type: Number, required: true, default: 0 },
    laborCostGoal: { type: Number, required: true, default: 0 },
    hoursGoal: { type: Number, required: true, default: 0 },
    spmhGoal: { type: Number, required: true, default: 0 },
    foodCostGoal: { type: Number, required: true, default: 0 },
    salesGoalTolerance: { type: Number, required: false, default: 0 },
    laborCostGoalTolerance: { type: Number, required: false, default: 0 },
    hoursGoalTolerance: { type: Number, required: false, default: 0 },
    spmhGoalTolerance: { type: Number, required: false, default: 0 },
    foodCostGoalTolerance: { type: Number, required: false, default: 0 },
  },
  { _id: false }
);

/** Keys 0-6 (Sunday-Saturday) to goal values. */
const weeklySchema = new Schema(
  {
    0: { type: goalValuesSchema, required: false },
    1: { type: goalValuesSchema, required: false },
    2: { type: goalValuesSchema, required: false },
    3: { type: goalValuesSchema, required: false },
    4: { type: goalValuesSchema, required: false },
    5: { type: goalValuesSchema, required: false },
    6: { type: goalValuesSchema, required: false },
  },
  { _id: false, strict: false }
);

const futureWeekSchema = new Schema(
  {
    weekStartDate: { type: String, required: true }, // YYYY-MM-DD Sunday
    days: {
      type: weeklySchema,
      default: () => ({}),
    },
  },
  { _id: false }
);

export interface GoalDocument extends Document {
  _id: Types.ObjectId;
  locationId: string;
  /** New shape: default goals. */
  default?: IGoalValues;
  /** New shape: per-day-of-week overrides (0=Sun .. 6=Sat). */
  weekly?: Partial<Record<DayOfWeek, IGoalValues>>;
  /** New shape: future week overrides. */
  futureWeeks?: Array<{ weekStartDate: string; days: Partial<Record<DayOfWeek, IGoalValues>> }>;
  /** Legacy: top-level goals (when default is missing, migrate on read). */
  salesGoal?: number;
  laborCostGoal?: number;
  hoursGoal?: number;
  spmhGoal?: number;
  foodCostGoal?: number;
  createdAt: Date;
  updatedAt: Date;
}

const goalSchema = new Schema<GoalDocument>(
  {
    locationId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    default: {
      type: goalValuesSchema,
      required: false,
    },
    weekly: {
      type: weeklySchema,
      required: false,
    },
    futureWeeks: {
      type: [futureWeekSchema],
      default: undefined,
      required: false,
    },
    // Legacy fields (keep for backward compatibility until migration)
    salesGoal: { type: Number, required: false, default: 0 },
    laborCostGoal: { type: Number, required: false, default: 0 },
    hoursGoal: { type: Number, required: false, default: 0 },
    spmhGoal: { type: Number, required: false, default: 0 },
    foodCostGoal: { type: Number, required: false, default: 0 },
  },
  {
    timestamps: true,
  }
);

export const GoalModel = mongoose.model<GoalDocument>("Goal", goalSchema);

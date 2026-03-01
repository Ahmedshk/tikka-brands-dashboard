import { z } from "zod";

const goalValueSchema = z.number().min(0, "Goal must be 0 or greater");

const goalValuesSchema = z.object({
  salesGoal: goalValueSchema,
  laborCostGoal: goalValueSchema,
  hoursGoal: goalValueSchema,
  spmhGoal: goalValueSchema,
  foodCostGoal: goalValueSchema,
});

const weeklySchema = z
  .object({
    0: goalValuesSchema.optional(),
    1: goalValuesSchema.optional(),
    2: goalValuesSchema.optional(),
    3: goalValuesSchema.optional(),
    4: goalValuesSchema.optional(),
    5: goalValuesSchema.optional(),
    6: goalValuesSchema.optional(),
  })
  .optional();

const futureWeekSchema = z.object({
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  days: weeklySchema.default({}),
});

export const getGoalsQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, "Location ID is required"),
    date: z.string().optional(),
  }),
});

export const upsertGoalsSchema = z.object({
  body: z.object({
    locationId: z.string().min(1, "Location ID is required"),
    default: goalValuesSchema.optional(),
    weekly: weeklySchema.optional(),
    futureWeeks: z.array(futureWeekSchema).optional(),
  }),
});

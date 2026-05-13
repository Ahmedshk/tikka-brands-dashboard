import { z } from "zod";

const goalValueSchema = z.number().min(0, "Goal must be 0 or greater");
const toleranceSchema = z.number().min(0, "Tolerance must be 0 or greater").max(100, "Tolerance must be 100 or less").optional();

const goalValuesSchema = z.object({
  salesGoal: goalValueSchema,
  laborCostGoal: goalValueSchema,
  hoursGoal: goalValueSchema,
  spmhGoal: goalValueSchema,
  foodCostGoal: goalValueSchema,
  salesGoalTolerance: toleranceSchema,
  laborCostGoalTolerance: toleranceSchema,
  hoursGoalTolerance: toleranceSchema,
  spmhGoalTolerance: toleranceSchema,
  foodCostGoalTolerance: toleranceSchema,
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

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

export const getGoalsQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, "Location ID is required"),
    date: z.string().optional(),
  }),
});

export const getGoalDailyActualsQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, "Location ID is required"),
    dates: z
      .string()
      .min(1, "dates is required (comma-separated YYYY-MM-DD)")
      .superRefine((val, ctx) => {
        const parts = val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length === 0) {
          ctx.addIssue({
            code: "custom",
            message: "At least one date is required",
          });
          return;
        }
        if (parts.length > 14) {
          ctx.addIssue({
            code: "custom",
            message: "At most 14 dates allowed",
          });
          return;
        }
        for (const p of parts) {
          if (!ymdRegex.test(p)) {
            ctx.addIssue({
              code: "custom",
              message: `Invalid date: ${p} (expected YYYY-MM-DD)`,
            });
            return;
          }
        }
      }),
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

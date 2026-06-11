import { z } from "zod";
import { isValidRoleBindingSubcategory } from "../utils/alertRoleBindingSubcategory.util.js";
import type { AlertRoleBindingCategory } from "../types/alertNotification.types.js";

const timeLocalSchema = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/);

const channelPrefsSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  sms: z.boolean(),
});

const intervalSchema = z
  .object({
    hours: z.number().int().min(0).max(168),
    minutes: z.number().int().min(0).max(59),
  })
  .refine((v) => v.hours > 0 || v.minutes > 0, {
    message: "Interval must have hours > 0 or minutes > 0",
  });

const runScheduleSchema = z.object({
  scheduleMode: z.enum(["fixed_times", "interval"]),
  fixedTimesLocal: z.array(timeLocalSchema).max(48),
  interval: intervalSchema,
});

const lowInventoryCadenceSchema = z.enum(["every_run", "once_per_day", "once_per_episode"]);

const metricToggleSchema = z.object({
  warnInToleranceZone: z.boolean(),
  alertBeyondTolerance: z.boolean(),
  run: runScheduleSchema.optional(),
});

const roleBindingSchema = z
  .object({
    category: z.enum(["financial_labor", "inventory_supply_chain", "reputation_hr"]),
    subcategory: z.string().optional(),
    roleId: z.string().min(1),
    channels: channelPrefsSchema,
  })
  .superRefine((b, ctx) => {
    const sub = b.subcategory?.trim();
    if (!sub) return;
    if (!isValidRoleBindingSubcategory(b.category as AlertRoleBindingCategory, sub)) {
      ctx.addIssue({
        code: "custom",
        message: `Invalid subcategory for ${b.category}`,
        path: ["subcategory"],
      });
    }
  });

export const updateAlertNotificationSettingsBodySchema = z.object({
  body: z.object({
    financialLabor: z
      .object({
        sales: metricToggleSchema.optional(),
        laborCostPct: metricToggleSchema.optional(),
        hours: metricToggleSchema.optional(),
        spmh: metricToggleSchema.optional(),
        foodCostPct: metricToggleSchema.optional(),
      })
      .optional(),
    inventorySupplyChain: z
      .object({
        deliveryOverdueNotReceived: z.boolean().optional(),
        run: runScheduleSchema.optional(),
        lowInventoryEnabled: z.boolean().optional(),
        lowInventoryRun: runScheduleSchema.optional(),
        lowInventoryCadence: lowInventoryCadenceSchema.optional(),
      })
      .optional(),
    reputationHr: z
      .object({
        trainingOverdue: z.boolean().optional(),
        trainingRun: runScheduleSchema.optional(),
        pendingPips: z.boolean().optional(),
        pendingPipsRun: runScheduleSchema.optional(),
        lowRatingReviews: z.boolean().optional(),
        lowRatingReviewsRun: runScheduleSchema.optional(),
        lowRatingThreshold: z.number().int().min(1).max(5).optional(),
      })
      .superRefine((rep, ctx) => {
        if (!rep.lowRatingReviews || !rep.lowRatingReviewsRun) {
          return;
        }
        const run = rep.lowRatingReviewsRun;
        if (run.scheduleMode !== "interval") {
          return;
        }
        if (run.interval.hours < 1) {
          ctx.addIssue({
            code: "custom",
            message: "Low rating review alert interval hours must be at least 1",
            path: ["lowRatingReviewsRun", "interval", "hours"],
          });
        }
        if (run.interval.minutes !== 0) {
          ctx.addIssue({
            code: "custom",
            message: "Low rating review alert interval must use whole hours only",
            path: ["lowRatingReviewsRun", "interval", "minutes"],
          });
        }
      })
      .optional(),
    roleBindings: z.array(roleBindingSchema).optional(),
  }),
});

export const dismissCommandCenterAlertsBodySchema = z.object({
  body: z.object({
    notificationIds: z.array(z.string().min(1)).min(1).max(100),
  }),
});

export const getCommandCenterAlertsQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, "locationId is required"),
  }),
});

export const getCommandCenterAlertHistoryQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, "locationId is required"),
    category: z.enum(["financial_labor", "inventory_supply_chain", "reputation_hr"]),
  }),
});

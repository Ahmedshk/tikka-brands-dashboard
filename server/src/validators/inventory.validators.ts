import { z } from 'zod';

const orderTrackerPeriodTypeEnum = z.enum([
  'currentWeek',
  'lastWeek',
  'currentMonth',
  'lastMonth',
  'currentYear',
  'lastYear',
  'today',
  'tomorrow',
  'since3DaysAgo',
  'lastNext30Days',
  'custom',
]);

const inventoryMetricEnum = z.enum([
  "currentFoodCost",
  "inventoryValue",
  "wasteCost",
  "pendingOrdersCount",
  "foodCostPercent",
  "theoreticalUsage",
  "theoreticalUsagePercent",
  "varianceItems",
]);

const pendingOrdersPeriodEnum = z.enum(['thisWeek', 'lastWeek']);

const countPeriodDateSchema = z
  .string()
  .regex(/^\d{4}[-\/]\d{2}[-\/]\d{2}$/, 'Date must be yyyy-MM-dd or yyyy/MM/dd');

export const getValidCountDatesQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, 'Location ID is required'),
  }),
});

export const getInventoryKPIsQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, 'Location ID is required'),
    metrics: z
      .string()
      .optional()
      .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined))
      .pipe(z.array(inventoryMetricEnum).optional()),
    pendingOrdersPeriod: pendingOrdersPeriodEnum.optional(),
    countPeriodStart: countPeriodDateSchema.optional(),
    countPeriodEnd: countPeriodDateSchema.optional(),
  }),
});

export const getOrdersQuerySchema = z
  .object({
    query: z.object({
      locationId: z.string().min(1, 'Location ID is required'),
      periodType: orderTrackerPeriodTypeEnum,
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
    }),
  })
  .refine(
    (data) => {
      if (data.query.periodType !== 'custom') return true;
      const start = data.query.periodStart?.trim();
      const end = data.query.periodEnd?.trim();
      return Boolean(start && end);
    },
    { message: 'Custom period requires both periodStart and periodEnd', path: ['query'] }
  );

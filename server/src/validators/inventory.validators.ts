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

export const getInventoryKPIsQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, 'Location ID is required'),
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

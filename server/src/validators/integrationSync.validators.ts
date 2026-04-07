import { z } from "zod";

const integrationResourceSchema = z.enum([
  "square_payments",
  "square_orders",
  "square_catalog",
  "square_team_members",
  "homebase_timecards",
  "marketman_valid_count_dates",
  "marketman_orders_sent",
  "marketman_orders_delivery",
  "marketman_orders_both",
]);

export const postIntegrationSyncSchema = z.object({
  body: z.object({
    resource: integrationResourceSchema,
    locationIds: z.array(z.string().min(1)).optional(),
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
  }),
});

export const getIntegrationSyncLogsSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
    page: z.coerce.number().int().min(1).optional().default(1),
  }),
});

/** POST /integration-sync/run-all-today — body optional (clients may send `{}` or omit). */
export const postIntegrationSyncRunAllTodaySchema = z.object({
  body: z.unknown().optional(),
});

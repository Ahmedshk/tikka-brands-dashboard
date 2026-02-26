import { z } from "zod";

const commandCenterMetricEnum = z.enum(["netSales", "laborCost", "reviewRating"]);

export const getCommandCenterKPIsQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, "Location ID is required"),
    metrics: z
      .string()
      .optional()
      .transform((s) =>
        s
          ? s
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
          : undefined
      )
      .pipe(z.array(commandCenterMetricEnum).optional()),
  }),
});

export const getHourlySalesQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, 'Location ID is required'),
  }),
});

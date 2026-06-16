import { z } from "zod";

const commandCenterMetricEnum = z.enum(["netSales", "laborCost", "reviewRating"]);

const commandCenterPeriodEnum = z.enum([
  "today",
  "weekToDate",
  "monthToDate",
  "lastWeek",
]);

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
    periods: z
      .string()
      .optional()
      .transform((s) =>
        s
          ? s
              .split(",")
              .map((x) => x.trim().toLowerCase())
              .filter(
                (p) =>
                  p === "today" ||
                  p === "weektodate" ||
                  p === "monthtodate" ||
                  p === "lastweek",
              )
              .map((p) => {
                if (p === "weektodate") return "weekToDate";
                if (p === "monthtodate") return "monthToDate";
                if (p === "lastweek") return "lastWeek";
                return "today";
              })
          : undefined
      )
      .pipe(z.array(commandCenterPeriodEnum).optional()),
  }),
});

export const getHourlySalesQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, 'Location ID is required'),
  }),
});

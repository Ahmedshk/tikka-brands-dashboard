import { z } from "zod";

export const getSalesLaborKPIsQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, "Location ID is required"),
  }),
});

export const getHourlyBreakdownQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, "Location ID is required"),
  }),
});

const periodTypeSchema = z.enum([
  "today",
  "last7days",
  "last30days",
  "last52weeks",
  "thisWeek",
  "thisMonth",
  "thisYear",
  "custom",
]);
const comparisonTypeSchema = z.enum([
  "none",
  "1DayPrior",
  "samePeriodPreviousWeek",
  "samePeriodPreviousMonth",
  "priorYear",
  "52WeeksPrior",
  "year2Before",
  "year3Before",
  "year4Before",
  "custom",
]);
const metricSchema = z.enum([
  "netSales",
  "transactions",
  "averageCheck",
  "laborCost",
  "hours",
]);
const groupBySchema = z.enum(["none", "source"]);

export const getSalesTrendQuerySchema = z.object({
  query: z
    .object({
      locationId: z.string().min(1, "Location ID is required"),
      periodType: periodTypeSchema.default("last30days"),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
      comparisonType: comparisonTypeSchema.default("priorYear"),
      comparisonDate: z.string().optional(),
      comparisonStart: z.string().optional(),
      comparisonEnd: z.string().optional(),
      metric: metricSchema.default("netSales"),
      groupBy: groupBySchema.default("none"),
    })
    .refine(
      (data) => {
        if (data.periodType !== "custom") return true;
        return (
          typeof data.periodStart === "string" &&
          data.periodStart.length > 0 &&
          typeof data.periodEnd === "string" &&
          data.periodEnd.length > 0
        );
      },
      { message: "periodStart and periodEnd required when periodType is custom" },
    )
    .refine(
      (data) => {
        if (data.comparisonType !== "custom") return true;
        return (
          typeof data.comparisonStart === "string" &&
          data.comparisonStart.length > 0 &&
          typeof data.comparisonEnd === "string" &&
          data.comparisonEnd.length > 0
        );
      },
      { message: "comparisonStart and comparisonEnd required when comparisonType is custom" },
    )
    .refine(
      (data) => {
        if (data.groupBy !== "source") return true;
        return data.metric === "netSales";
      },
      { message: "groupBy source requires metric netSales" },
    ),
});

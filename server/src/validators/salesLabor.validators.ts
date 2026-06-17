import { z } from "zod";
import { withLocationQuery } from "./locationQuery.validators.js";

const salesLaborMetricEnum = z.enum([
  "actualTotalSales",
  "actualLaborCostPercent",
  "totalHours",
  "salesPerManHour",
  "transactionCount",
  "averageCheck",
  "totalDiscounts",
  "totalRefunds",
  "sourcesOfSales",
]);

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

/** Refine: when periodType is custom, periodStart and periodEnd must be provided. */
function refineCustomPeriod(
  data: { periodType: string; periodStart?: string | undefined; periodEnd?: string | undefined },
): boolean {
  if (data.periodType !== "custom") return true;
  return (
    typeof data.periodStart === "string" &&
    data.periodStart.length > 0 &&
    typeof data.periodEnd === "string" &&
    data.periodEnd.length > 0
  );
}

export const getSalesLaborKPIsQuerySchema = z.object({
  query: withLocationQuery({
    metrics: z
      .string()
      .optional()
      .transform((s) =>
        s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined
      )
      .pipe(z.array(salesLaborMetricEnum).optional()),
    periodType: periodTypeSchema.default("today"),
    periodStart: z.string().optional(),
    periodEnd: z.string().optional(),
  }).refine(refineCustomPeriod, {
    message: "periodStart and periodEnd required when periodType is custom",
  }),
});

export const getHourlyBreakdownQuerySchema = z.object({
  query: withLocationQuery({
    periodType: periodTypeSchema.default("today"),
    periodStart: z.string().optional(),
    periodEnd: z.string().optional(),
  }).refine(refineCustomPeriod, {
    message: "periodStart and periodEnd required when periodType is custom",
  }),
});

export const getTimesheetQuerySchema = z.object({
  query: withLocationQuery({
    periodType: periodTypeSchema.default("today"),
    periodStart: z.string().optional(),
    periodEnd: z.string().optional(),
  }).refine(refineCustomPeriod, {
    message: "periodStart and periodEnd required when periodType is custom",
  }),
});
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
  query: withLocationQuery({
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

/** Same as getSalesTrend but without metric/groupBy (for sales-trend-kpi). */
export const getSalesTrendKpiQuerySchema = z.object({
  query: withLocationQuery({
    periodType: periodTypeSchema.default("last30days"),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
      comparisonType: comparisonTypeSchema.default("priorYear"),
      comparisonDate: z.string().optional(),
      comparisonStart: z.string().optional(),
      comparisonEnd: z.string().optional(),
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
      {
        message:
          "comparisonStart and comparisonEnd required when comparisonType is custom",
      },
    ),
});

/** Same as getSalesTrendKpi (for sales-by-category). */
export const getSalesByCategoryQuerySchema = z.object({
  query: withLocationQuery({
    periodType: periodTypeSchema.default("last30days"),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
      comparisonType: comparisonTypeSchema.default("priorYear"),
      comparisonDate: z.string().optional(),
      comparisonStart: z.string().optional(),
      comparisonEnd: z.string().optional(),
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
      {
        message:
          "comparisonStart and comparisonEnd required when comparisonType is custom",
      },
    ),
});

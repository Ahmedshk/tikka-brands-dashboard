import { Request, Response, NextFunction } from "express";
import {
  getLaborCostInRange,
  getLaborCostPerHourInRange,
  getLaborAndHoursTimeSeriesInRange,
  getTotalHoursInRange,
} from "../services/homebase.service.js";
import { LocationService } from "../services/location.service.js";
import {
  getOrderStatsAndSourcesInRange,
  getOrderTimeSeriesInRange,
  getOrderTimeSeriesBySourceInRange,
  getOrderedBucketsAndLabels,
  getNetSalesByCategoryInRange,
  searchOrdersInRange,
  type SourcesOfSalesSegment,
  type SalesTrendGranularity,
} from "../services/square.service.js";
import type { Granularity } from "../utils/salesTrendDateRange.util.js";
import {
  getSalesTrendPeriodRange,
  getSalesTrendComparisonRange,
  getStartOfDayUtc,
} from "../utils/salesTrendDateRange.util.js";
import type { TimeRange } from "../utils/businessHours.util.js";
import {
  getBusinessStartTimeRange,
  getBusinessHourIndex,
} from "../utils/timezone.util.js";
import { NotFoundError } from "../utils/errors.util.js";
import { assertCanAccessMetrics, parseMetricsQuery } from "../config/kpi-metrics.config.js";

const locationService = new LocationService();

const SALES_LABOR_KPI_METRICS = [
  "actualTotalSales",
  "actualLaborCostPercent",
  "totalHours",
  "salesPerManHour",
  "transactionCount",
  "averageCheck",
  "totalDiscounts",
  "totalRefunds",
  "sourcesOfSales",
] as const;

export interface SalesLaborKPIsData {
  actualTotalSales: number | null;
  actualLaborCostPercent: number | null;
  totalHours: number | null;
  salesPerManHour: number | null;
  transactionCount: number | null;
  averageCheck: number | null;
  totalDiscounts: number | null;
  totalRefunds: number | null;
  totalRefundCount: number | null;
  sourcesOfSales: SourcesOfSalesSegment[];
}

export const getSalesLaborKPIs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId : "";
    const metrics = parseMetricsQuery(req.query.metrics);
    if (metrics?.length) {
      const invalid = metrics.filter(
        (m) => !SALES_LABOR_KPI_METRICS.includes(m as (typeof SALES_LABOR_KPI_METRICS)[number])
      );
      if (invalid.length > 0) {
        res.status(400).json({ success: false, message: "Invalid metric" });
        return;
      }
      assertCanAccessMetrics(req.user?.permissions, "sales-labor-detail", metrics);
    }
    const withCreds = await locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, squareAccessToken, homebaseApiKey } = withCreds;

    const timezone = location.timezone?.trim();
    const businessStartTime = location.businessStartTime?.trim() ?? "00:00";
    if (!timezone) {
      res.status(200).json({
        success: true,
        data: buildEmptySalesLaborKPIs(),
      });
      return;
    }

    const range: TimeRange = getBusinessStartTimeRange(
      timezone,
      businessStartTime,
    );

    let actualTotalSales: number | null = null;
    let transactionCount: number | null = null;
    let totalDiscounts: number | null = null;
    let totalRefunds: number | null = null;
    let totalRefundCount: number | null = null;
    let sourcesOfSales: SourcesOfSalesSegment[] = [];

    const squareLocationId = location.squareLocationId?.trim();
    if (squareLocationId) {
      try {
        const { orderStats, sourcesOfSales: segments } =
          await getOrderStatsAndSourcesInRange(squareLocationId, range, {
            accessToken: squareAccessToken ?? undefined,
          });
        actualTotalSales = orderStats.netSalesCents / 100;
        transactionCount = orderStats.orderCount;
        totalDiscounts = orderStats.totalDiscountCents / 100;
        totalRefunds = orderStats.totalRefundCents / 100;
        totalRefundCount = orderStats.refundCount;
        sourcesOfSales = segments;
      } catch (err) {
        console.error("[Sales Labor] Square order stats error:", err);
      }
    }

    let laborCost: number | null = null;
    let totalHours: number | null = null;

    const homebaseLocationId = location.homebaseLocationId?.trim();
    if (homebaseLocationId) {
      try {
        const homebaseOptions = { apiKey: homebaseApiKey ?? undefined };
        const [cost, hours] = await Promise.all([
          getLaborCostInRange(homebaseLocationId, range, homebaseOptions),
          getTotalHoursInRange(homebaseLocationId, range, homebaseOptions),
        ]);
        laborCost = cost;
        totalHours = hours;
      } catch (err) {
        console.error("[Sales Labor] Homebase error:", err);
      }
    }

    let actualLaborCostPercent: number | null = null;
    if (
      actualTotalSales !== null &&
      laborCost !== null &&
      actualTotalSales > 0
    ) {
      actualLaborCostPercent = (laborCost / actualTotalSales) * 100;
    }

    let salesPerManHour: number | null = null;
    if (actualTotalSales !== null && totalHours !== null && totalHours > 0) {
      salesPerManHour = actualTotalSales / totalHours;
    }

    let averageCheck: number | null = null;
    if (
      actualTotalSales !== null &&
      transactionCount !== null &&
      transactionCount > 0
    ) {
      averageCheck = actualTotalSales / transactionCount;
    }

    const fullData = {
      actualTotalSales,
      actualLaborCostPercent,
      totalHours,
      salesPerManHour,
      transactionCount,
      averageCheck,
      totalDiscounts,
      totalRefunds,
      totalRefundCount,
      sourcesOfSales,
    };
    let data: Partial<SalesLaborKPIsData> | SalesLaborKPIsData = fullData;
    if (metrics?.length) {
      data = Object.fromEntries(
        metrics
          .filter((k) => k in fullData)
          .map((k) => [k, (fullData as Record<string, unknown>)[k]])
      ) as Partial<SalesLaborKPIsData>;
      if (metrics.includes("totalRefunds") && "totalRefundCount" in fullData) {
        (data as Record<string, unknown>).totalRefundCount = fullData.totalRefundCount;
      }
    }

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

function buildEmptySalesLaborKPIs(): SalesLaborKPIsData {
  return {
    actualTotalSales: null,
    actualLaborCostPercent: null,
    totalHours: null,
    salesPerManHour: null,
    transactionCount: null,
    averageCheck: null,
    totalDiscounts: null,
    totalRefunds: null,
    totalRefundCount: null,
    sourcesOfSales: [],
  };
}

export interface HourlyBreakdownData {
  labels: string[];
  netSalesPerHour: number[];
  laborCostPercentPerHour: (number | null)[];
}

function formatHourLabel(hour24: number): string {
  if (hour24 === 0) return "12 am";
  if (hour24 === 12) return "12 pm";
  if (hour24 < 12) return `${String(hour24).padStart(2, "0")} am`;
  return `${String(hour24 - 12).padStart(2, "0")} pm`;
}

export const getHourlyBreakdown = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId : "";
    const withCreds = await locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, squareAccessToken, homebaseApiKey } = withCreds;

    const timezone = location.timezone?.trim();
    const businessStartTime = location.businessStartTime?.trim() ?? "00:00";
    const labels: string[] = [];
    const startHour = Number.parseInt(
      businessStartTime.split(":")[0] ?? "0",
      10,
    );
    for (let slot = 0; slot < 24; slot++) {
      const hour24 = (startHour + slot) % 24;
      labels.push(formatHourLabel(hour24));
    }

    const netSalesCentsBySlot = new Array<number>(24).fill(0);
    const laborCostPercentPerHour: (number | null)[] = [];

    if (!timezone) {
      res.status(200).json({
        success: true,
        data: {
          labels,
          netSalesPerHour: netSalesCentsBySlot.map(() => 0),
          laborCostPercentPerHour: new Array(24).fill(null),
        },
      });
      return;
    }

    const range: TimeRange = getBusinessStartTimeRange(
      timezone,
      businessStartTime,
    );

    const squareLocationId = location.squareLocationId?.trim();
    if (squareLocationId) {
      try {
        const orders = await searchOrdersInRange(squareLocationId, range, {
          accessToken: squareAccessToken ?? undefined,
        });
        for (const order of orders) {
          const slot = getBusinessHourIndex(
            order.created_at,
            timezone,
            businessStartTime,
          );
          if (slot >= 0 && slot < 24) {
            netSalesCentsBySlot[slot] =
              (netSalesCentsBySlot[slot] ?? 0) + order.amountCents;
          }
        }
      } catch (err) {
        console.error("[Sales Labor] Square hourly orders error:", err);
      }
    }

    const netSalesPerHour = netSalesCentsBySlot.map((cents) => cents / 100);

    let laborCostPerHour = new Array<number>(24).fill(0);
    const homebaseLocationId = location.homebaseLocationId?.trim();
    if (homebaseLocationId) {
      try {
        laborCostPerHour = await getLaborCostPerHourInRange(
          homebaseLocationId,
          range,
          timezone,
          businessStartTime,
          { apiKey: homebaseApiKey ?? undefined },
        );
      } catch (err) {
        console.error("[Sales Labor] Homebase hourly labor error:", err);
      }
    }

    for (let i = 0; i < 24; i++) {
      const sales = netSalesPerHour[i] ?? 0;
      const labor = laborCostPerHour[i] ?? 0;
      laborCostPercentPerHour.push(sales > 0 ? (labor / sales) * 100 : null);
    }

    res.status(200).json({
      success: true,
      data: {
        labels,
        netSalesPerHour,
        laborCostPercentPerHour,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** Map API granularity to Square/Homebase granularity. */
function toSeriesGranularity(g: Granularity): SalesTrendGranularity {
  return g as SalesTrendGranularity;
}

function sumNullable(arr: (number | null)[]): number {
  return arr.reduce((s, v) => s + (v ?? 0), 0);
}

export const getSalesTrend = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId : "";
    const periodType = (req.query.periodType as string) || "last30days";
    const periodStart =
      typeof req.query.periodStart === "string"
        ? req.query.periodStart
        : undefined;
    const periodEnd =
      typeof req.query.periodEnd === "string" ? req.query.periodEnd : undefined;
    const comparisonType = (req.query.comparisonType as string) || "priorYear";
    const comparisonDate =
      typeof req.query.comparisonDate === "string"
        ? req.query.comparisonDate
        : undefined;
    const comparisonStart =
      typeof req.query.comparisonStart === "string"
        ? req.query.comparisonStart
        : undefined;
    const comparisonEnd =
      typeof req.query.comparisonEnd === "string"
        ? req.query.comparisonEnd
        : undefined;
    const metric = (req.query.metric as string) || "netSales";
    const groupBy = (req.query.groupBy as string) || "none";

    const withCreds = await locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, squareAccessToken, homebaseApiKey } = withCreds;
    const timezone = location.timezone?.trim() ?? "UTC";
    const businessStartTime = location.businessStartTime?.trim() ?? "00:00";

    const period = getSalesTrendPeriodRange(
      periodType as Parameters<typeof getSalesTrendPeriodRange>[0],
      timezone,
      periodStart,
      periodEnd,
      businessStartTime,
    );

    if (period.granularity === "monthly") {
      const displayEnd = period.displayEndAt ?? period.endAt;
      const displayRange = { startAt: period.startAt, endAt: displayEnd };
      const buckets = getOrderedBucketsAndLabels(displayRange, timezone, "monthly");
      for (let i = 0; i < buckets.keys.length; i++) {
        const key = buckets.keys[i];
        if (key == null) continue;
        const label = buckets.labels[i];
        const [yStr, mStr] = key.split("-");
        const y = Number.parseInt(yStr ?? "0", 10);
        const m = Number.parseInt(mStr ?? "0", 10) - 1;
        const monthStart = getStartOfDayUtc(y, m, 1, timezone);
        const monthEnd = new Date(getStartOfDayUtc(y, m + 1, 1, timezone).getTime() - 1);
      }
    }

    const displayEnd = period.displayEndAt ?? period.endAt;
    const comparison = getSalesTrendComparisonRange(
      comparisonType as Parameters<typeof getSalesTrendComparisonRange>[0],
      period.startAt,
      displayEnd,
      timezone,
      comparisonDate,
      comparisonStart,
      comparisonEnd,
      businessStartTime,
    );

    const seriesGranularity = toSeriesGranularity(period.granularity);
    const dataRange = { startAt: period.startAt, endAt: period.endAt };
    const displayRange = { startAt: period.startAt, endAt: displayEnd };
    const comparisonRange = comparison
      ? { startAt: comparison.startAt, endAt: comparison.endAt }
      : null;
    const useDisplayRange = period.displayEndAt != null;

    if (metric === "netSales" && groupBy === "source") {
      const squareLocationId = location.squareLocationId?.trim();
      if (!squareLocationId) {
        res.status(200).json({
          success: true,
          data: {
            xAxisLabels: [],
            granularity: period.granularity,
            series: [],
          },
        });
        return;
      }
      const result = await getOrderTimeSeriesBySourceInRange(
        squareLocationId,
        dataRange,
        timezone,
        seriesGranularity,
        { accessToken: squareAccessToken ?? undefined },
      );
      let xAxisLabelsSource = result.labels;
      let seriesSource = result.series;
      if (useDisplayRange) {
        const displayBuckets = getOrderedBucketsAndLabels(
          displayRange,
          timezone,
          seriesGranularity,
        );
        const dataBuckets = getOrderedBucketsAndLabels(
          dataRange,
          timezone,
          seriesGranularity,
        );
        xAxisLabelsSource = displayBuckets.labels;
        const dataLen = dataBuckets.keys.length;
        seriesSource = result.series.map((s) => ({
          ...s,
          data: displayBuckets.keys.map((_, i) =>
            i < dataLen ? (s.data[i] ?? 0) : 0,
          ),
        }));
      }
      res.status(200).json({
        success: true,
        data: {
          xAxisLabels: xAxisLabelsSource,
          granularity: period.granularity,
          series: seriesSource,
        },
      });
      return;
    }

    const squareLocationId = location.squareLocationId?.trim();
    const homebaseLocationId = location.homebaseLocationId?.trim();

    let xAxisLabels: string[] = [];
    let currentPeriod: (number | null)[] = [];
    let comparisonPeriod: (number | null)[] = [];

    if (
      metric === "netSales" ||
      metric === "transactions" ||
      metric === "averageCheck"
    ) {
      if (squareLocationId) {
        const [current, comp] = await Promise.all([
          getOrderTimeSeriesInRange(
            squareLocationId,
            dataRange,
            timezone,
            seriesGranularity,
            { accessToken: squareAccessToken ?? undefined },
          ),
          comparisonRange
            ? getOrderTimeSeriesInRange(
                squareLocationId,
                comparisonRange,
                timezone,
                seriesGranularity,
                { accessToken: squareAccessToken ?? undefined },
              )
            : null,
        ]);
        if (useDisplayRange) {
          const displayBuckets = getOrderedBucketsAndLabels(
            displayRange,
            timezone,
            seriesGranularity,
          );
          const dataBuckets = getOrderedBucketsAndLabels(
            dataRange,
            timezone,
            seriesGranularity,
          );
          xAxisLabels = displayBuckets.labels;
          const netSalesByKey: Record<string, number> = {};
          const txnByKey: Record<string, number> = {};
          dataBuckets.keys.forEach((k, j) => {
            netSalesByKey[k] = current.netSales[j] ?? 0;
            txnByKey[k] = current.transactionCount[j] ?? 0;
          });
          if (metric === "netSales") {
            currentPeriod = displayBuckets.keys.map((k) =>
              k in netSalesByKey ? netSalesByKey[k]! : null,
            );
          } else if (metric === "transactions") {
            currentPeriod = displayBuckets.keys.map((k) =>
              k in txnByKey ? txnByKey[k]! : null,
            );
          } else {
            currentPeriod = displayBuckets.keys.map((k) => {
              const sales = netSalesByKey[k];
              const txn = txnByKey[k];
              if (sales === undefined || txn === undefined) return null;
              return txn > 0 ? sales / txn : 0;
            });
          }
          const compNetSales = comp?.netSales ?? [];
          const compTxn = comp?.transactionCount ?? [];
          if (metric === "netSales") {
            comparisonPeriod = displayBuckets.keys.map((_, i) =>
              i < compNetSales.length ? compNetSales[i]! : 0,
            );
          } else if (metric === "transactions") {
            comparisonPeriod = displayBuckets.keys.map((_, i) =>
              i < compTxn.length ? compTxn[i]! : 0,
            );
          } else {
            comparisonPeriod = displayBuckets.keys.map((_, i) =>
              i < compNetSales.length && (compTxn[i] ?? 0) > 0
                ? compNetSales[i]! / compTxn[i]!
                : 0,
            );
          }
        } else {
          xAxisLabels = current.labels;
          if (metric === "netSales") {
            currentPeriod = current.netSales;
            comparisonPeriod = comp
              ? comp.netSales
              : current.netSales.map(() => 0);
          } else if (metric === "transactions") {
            currentPeriod = current.transactionCount;
            comparisonPeriod = comp
              ? comp.transactionCount
              : current.transactionCount.map(() => 0);
          } else {
            currentPeriod = current.netSales.map((_, i) =>
              (current.transactionCount[i] ?? 0) > 0
                ? current.netSales[i]! / current.transactionCount[i]!
                : 0,
            );
            comparisonPeriod = comp
              ? comp.netSales.map((_, i) =>
                  (comp.transactionCount[i] ?? 0) > 0
                    ? comp.netSales[i]! / comp.transactionCount[i]!
                    : 0,
                )
              : currentPeriod.map(() => 0);
          }
        }
      }
    } else {
      if (homebaseLocationId) {
        try {
          const [current, comp] = await Promise.all([
            getLaborAndHoursTimeSeriesInRange(
              homebaseLocationId,
              dataRange,
              timezone,
              seriesGranularity,
              { apiKey: homebaseApiKey ?? undefined },
            ),
            comparisonRange
              ? getLaborAndHoursTimeSeriesInRange(
                  homebaseLocationId,
                  comparisonRange,
                  timezone,
                  seriesGranularity,
                  { apiKey: homebaseApiKey ?? undefined },
                )
              : null,
          ]);
          if (useDisplayRange) {
            const displayBuckets = getOrderedBucketsAndLabels(
              displayRange,
              timezone,
              seriesGranularity,
            );
            const dataBuckets = getOrderedBucketsAndLabels(
              dataRange,
              timezone,
              seriesGranularity,
            );
            xAxisLabels = displayBuckets.labels;
            const laborCostByKey: Record<string, number> = {};
            const hoursByKey: Record<string, number> = {};
            dataBuckets.keys.forEach((k, j) => {
              laborCostByKey[k] = current.laborCost[j] ?? 0;
              hoursByKey[k] = current.hours[j] ?? 0;
            });
            if (metric === "laborCost") {
              currentPeriod = displayBuckets.keys.map((k) =>
                k in laborCostByKey ? laborCostByKey[k]! : null,
              );
              comparisonPeriod = displayBuckets.keys.map((_, i) =>
                i < (comp?.laborCost.length ?? 0) ? comp!.laborCost[i]! : 0,
              );
            } else {
              currentPeriod = displayBuckets.keys.map((k) =>
                k in hoursByKey ? hoursByKey[k]! : null,
              );
              comparisonPeriod = displayBuckets.keys.map((_, i) =>
                i < (comp?.hours.length ?? 0) ? comp!.hours[i]! : 0,
              );
            }
          } else {
            xAxisLabels = current.labels;
            if (metric === "laborCost") {
              currentPeriod = current.laborCost;
              comparisonPeriod = comp
                ? comp.laborCost
                : current.laborCost.map(() => 0);
            } else {
              currentPeriod = current.hours;
              comparisonPeriod = comp ? comp.hours : current.hours.map(() => 0);
            }
          }
        } catch (laborHoursError) {
          const msg =
            laborHoursError instanceof Error
              ? laborHoursError.message
              : String(laborHoursError);
          if (
            msg.includes("invalid_date_range") ||
            msg.includes("cannot exceed a month")
          ) {
            res.status(422).json({
              success: false,
              message:
                "Your date range cannot exceed a month. Try a smaller range.",
            });
            return;
          }
          throw laborHoursError;
        }
      }
    }

    if (comparisonRange && comparisonPeriod.length > 0) {
      const currentRange = useDisplayRange ? displayRange : dataRange;
      const currentBuckets = getOrderedBucketsAndLabels(currentRange, timezone, seriesGranularity);
      const compBuckets = getOrderedBucketsAndLabels(comparisonRange, timezone, seriesGranularity);

      const currentByKey = new Map<string, number | null>();
      currentBuckets.keys.forEach((k, i) => { currentByKey.set(k, currentPeriod[i] ?? null); });
      const compByKey = new Map<string, number | null>();
      compBuckets.keys.forEach((k, i) => { compByKey.set(k, comparisonPeriod[i] ?? null); });

      const currentKeySet = new Set(currentBuckets.keys);
      const compKeySet = new Set(compBuckets.keys);
      const hasExtraCompKeys = compBuckets.keys.some((k) => !currentKeySet.has(k));
      const hasOverlap = currentBuckets.keys.some((k) => compKeySet.has(k));

      let finalKeys: string[];
      if (hasExtraCompKeys && hasOverlap) {
        const now = new Date();
        const mergedStart = new Date(Math.min(
          new Date(currentRange.startAt).getTime(),
          new Date(comparisonRange.startAt).getTime(),
        )).toISOString();
        const mergedEnd = new Date(Math.min(
          Math.max(
            new Date(currentRange.endAt).getTime(),
            new Date(comparisonRange.endAt).getTime(),
          ),
          now.getTime(),
        )).toISOString();
        const mergedBuckets = getOrderedBucketsAndLabels(
          { startAt: mergedStart, endAt: mergedEnd },
          timezone,
          seriesGranularity,
        );
        finalKeys = mergedBuckets.keys;
        xAxisLabels = mergedBuckets.labels;
        currentPeriod = mergedBuckets.keys.map((k) =>
          currentByKey.has(k) ? currentByKey.get(k)! : null,
        );
        comparisonPeriod = mergedBuckets.keys.map((k) =>
          compByKey.has(k) ? compByKey.get(k)! : null,
        );
      } else {
        finalKeys = hasExtraCompKeys ? currentBuckets.keys : compBuckets.keys;
        if (hasExtraCompKeys && !hasOverlap) {
          if (comparisonPeriod.length !== currentPeriod.length) {
            comparisonPeriod = currentPeriod.map((_, i) =>
              i < comparisonPeriod.length ? comparisonPeriod[i]! : null,
            );
          }
        }
      }

      const now = new Date();
      comparisonPeriod = comparisonPeriod.map((val, i) => {
        const key = finalKeys[i];
        if (!key) return val;
        const parts = key.split("-").map((p) => Number.parseInt(p, 10));
        let bucketDate: Date;
        if (seriesGranularity === "hourly" && parts.length >= 4) {
          bucketDate = getStartOfDayUtc(parts[0]!, parts[1]! - 1, parts[2]!, timezone);
          bucketDate = new Date(bucketDate.getTime() + parts[3]! * 60 * 60 * 1000);
        } else if (seriesGranularity === "monthly" && parts.length >= 2) {
          bucketDate = getStartOfDayUtc(parts[0]!, parts[1]! - 1, 1, timezone);
        } else {
          bucketDate = getStartOfDayUtc(parts[0]!, parts[1]! - 1, parts[2]!, timezone);
        }
        return bucketDate > now ? null : val;
      });
    } else if (
      comparisonPeriod.length > 0 &&
      comparisonPeriod.length !== currentPeriod.length
    ) {
      comparisonPeriod = currentPeriod.map(() => 0);
    }

    res.status(200).json({
      success: true,
      data: {
        xAxisLabels,
        granularity: period.granularity,
        currentPeriod,
        comparisonPeriod,
      },
    });
  } catch (error) {
    next(error);
  }
};

export interface SalesTrendKpiPeriod {
  totalNetSales: number;
  totalTransactions: number;
  totalHours: number;
  numDays: number;
}

export const getSalesTrendKpi = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId : "";
    const periodType = (req.query.periodType as string) || "last30days";
    const periodStart =
      typeof req.query.periodStart === "string"
        ? req.query.periodStart
        : undefined;
    const periodEnd =
      typeof req.query.periodEnd === "string" ? req.query.periodEnd : undefined;
    const comparisonType = (req.query.comparisonType as string) || "priorYear";
    const comparisonDate =
      typeof req.query.comparisonDate === "string"
        ? req.query.comparisonDate
        : undefined;
    const comparisonStart =
      typeof req.query.comparisonStart === "string"
        ? req.query.comparisonStart
        : undefined;
    const comparisonEnd =
      typeof req.query.comparisonEnd === "string"
        ? req.query.comparisonEnd
        : undefined;

    const withCreds = await locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, squareAccessToken, homebaseApiKey } = withCreds;
    const timezone = location.timezone?.trim() ?? "UTC";
    const businessStartTime = location.businessStartTime?.trim() ?? "00:00";

    const period = getSalesTrendPeriodRange(
      periodType as Parameters<typeof getSalesTrendPeriodRange>[0],
      timezone,
      periodStart,
      periodEnd,
      businessStartTime,
    );
    const displayEnd = period.displayEndAt ?? period.endAt;
    const comparison = getSalesTrendComparisonRange(
      comparisonType as Parameters<typeof getSalesTrendComparisonRange>[0],
      period.startAt,
      displayEnd,
      timezone,
      comparisonDate,
      comparisonStart,
      comparisonEnd,
      businessStartTime,
    );

    const seriesGranularity = toSeriesGranularity(period.granularity);
    const dataRange = { startAt: period.startAt, endAt: period.endAt };
    const comparisonRange = comparison
      ? { startAt: comparison.startAt, endAt: comparison.endAt }
      : null;

    const currentBuckets = getOrderedBucketsAndLabels(
      dataRange,
      timezone,
      seriesGranularity,
    );
    const numDaysCurrent = currentBuckets.keys.length;
    const numDaysComparison = comparisonRange
      ? getOrderedBucketsAndLabels(
          comparisonRange,
          timezone,
          seriesGranularity,
        ).keys.length
      : 0;

    let totalNetSalesCurrent = 0;
    let totalTransactionsCurrent = 0;
    let totalNetSalesComparison = 0;
    let totalTransactionsComparison = 0;
    let totalHoursCurrent = 0;
    let totalHoursComparison = 0;

    const squareLocationId = location.squareLocationId?.trim();
    if (squareLocationId) {
      const [current, comp] = await Promise.all([
        getOrderTimeSeriesInRange(
          squareLocationId,
          dataRange,
          timezone,
          seriesGranularity,
          { accessToken: squareAccessToken ?? undefined },
        ),
        comparisonRange
          ? getOrderTimeSeriesInRange(
              squareLocationId,
              comparisonRange,
              timezone,
              seriesGranularity,
              { accessToken: squareAccessToken ?? undefined },
            )
          : null,
      ]);
      totalNetSalesCurrent = sumNullable(current.netSales);
      totalTransactionsCurrent = sumNullable(current.transactionCount);
      totalNetSalesComparison = comp
        ? sumNullable(comp.netSales)
        : 0;
      totalTransactionsComparison = comp
        ? sumNullable(comp.transactionCount)
        : 0;
    }

    const homebaseLocationId = location.homebaseLocationId?.trim();
    if (homebaseLocationId) {
      try {
        const [current, comp] = await Promise.all([
          getLaborAndHoursTimeSeriesInRange(
            homebaseLocationId,
            dataRange,
            timezone,
            seriesGranularity,
            { apiKey: homebaseApiKey ?? undefined },
          ),
          comparisonRange
            ? getLaborAndHoursTimeSeriesInRange(
                homebaseLocationId,
                comparisonRange,
                timezone,
                seriesGranularity,
                { apiKey: homebaseApiKey ?? undefined },
              )
            : null,
        ]);
        totalHoursCurrent = current.hours.reduce((s, v) => s + (v ?? 0), 0);
        totalHoursComparison = comp
          ? comp.hours.reduce((s, v) => s + (v ?? 0), 0)
          : 0;
      } catch (laborErr) {
        const msg =
          laborErr instanceof Error ? laborErr.message : String(laborErr);
        if (
          msg.includes("invalid_date_range") ||
          msg.includes("cannot exceed a month")
        ) {
          res.status(422).json({
            success: false,
            message:
              "Your date range cannot exceed a month. Try a smaller range.",
          });
          return;
        }
        throw laborErr;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        current: {
          totalNetSales: totalNetSalesCurrent,
          totalTransactions: totalTransactionsCurrent,
          totalHours: totalHoursCurrent,
          numDays: numDaysCurrent,
        },
        comparison: {
          totalNetSales: totalNetSalesComparison,
          totalTransactions: totalTransactionsComparison,
          totalHours: totalHoursComparison,
          numDays: numDaysComparison,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getSalesByCategory = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId : "";
    const periodType = (req.query.periodType as string) || "last30days";
    const periodStart =
      typeof req.query.periodStart === "string"
        ? req.query.periodStart
        : undefined;
    const periodEnd =
      typeof req.query.periodEnd === "string" ? req.query.periodEnd : undefined;
    const comparisonType = (req.query.comparisonType as string) || "priorYear";
    const comparisonDate =
      typeof req.query.comparisonDate === "string"
        ? req.query.comparisonDate
        : undefined;
    const comparisonStart =
      typeof req.query.comparisonStart === "string"
        ? req.query.comparisonStart
        : undefined;
    const comparisonEnd =
      typeof req.query.comparisonEnd === "string"
        ? req.query.comparisonEnd
        : undefined;

    const withCreds = await locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, squareAccessToken } = withCreds;
    const timezone = location.timezone?.trim() ?? "UTC";
    const businessStartTime = location.businessStartTime?.trim() ?? "00:00";

    const period = getSalesTrendPeriodRange(
      periodType as Parameters<typeof getSalesTrendPeriodRange>[0],
      timezone,
      periodStart,
      periodEnd,
      businessStartTime,
    );
    const displayEnd = period.displayEndAt ?? period.endAt;
    const comparison = getSalesTrendComparisonRange(
      comparisonType as Parameters<typeof getSalesTrendComparisonRange>[0],
      period.startAt,
      displayEnd,
      timezone,
      comparisonDate,
      comparisonStart,
      comparisonEnd,
      businessStartTime,
    );

    const dataRange = { startAt: period.startAt, endAt: period.endAt };
    const comparisonRange = comparison
      ? { startAt: comparison.startAt, endAt: comparison.endAt }
      : null;

    const squareLocationId = location.squareLocationId?.trim();
    const squareOptions = { accessToken: squareAccessToken ?? undefined };

    let currentResult = { categories: [] as Array<{ name: string; netSalesCents: number }>, totalNetSalesCents: 0 };
    let comparisonResult = { categories: [] as Array<{ name: string; netSalesCents: number }>, totalNetSalesCents: 0 };

    if (squareLocationId) {
      const [current, comp] = await Promise.all([
        getNetSalesByCategoryInRange(
          squareLocationId,
          dataRange,
          squareOptions,
        ),
        comparisonRange
          ? getNetSalesByCategoryInRange(
              squareLocationId,
              comparisonRange,
              squareOptions,
            )
          : Promise.resolve({ categories: [], totalNetSalesCents: 0 }),
      ]);
      currentResult = current;
      comparisonResult = comp;
    }

    const allNames = new Set<string>();
    for (const c of currentResult.categories) allNames.add(c.name);
    for (const c of comparisonResult.categories) allNames.add(c.name);
    const currentByName = new Map(
      currentResult.categories.map((c) => [c.name, c.netSalesCents]),
    );
    const comparisonByName = new Map(
      comparisonResult.categories.map((c) => [c.name, c.netSalesCents]),
    );

    const merged = Array.from(allNames)
      .map((name) => ({
        label: name,
        netSales:
          (currentByName.get(name) ?? 0) / 100,
        comparisonNetSales:
          (comparisonByName.get(name) ?? 0) / 100,
      }))
      .sort((a, b) => b.netSales - a.netSales);

    res.status(200).json({
      success: true,
      data: {
        current: {
          categories: merged.map(({ label, netSales }) => ({ label, netSales })),
          totalNetSales: currentResult.totalNetSalesCents / 100,
        },
        comparison: {
          categories: merged.map(({ label, comparisonNetSales }) => ({
            label,
            netSales: comparisonNetSales,
          })),
          totalNetSales: comparisonResult.totalNetSalesCents / 100,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

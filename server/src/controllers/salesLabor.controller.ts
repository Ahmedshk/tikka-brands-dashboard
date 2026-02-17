import { Request, Response, NextFunction } from "express";
import {
  getLaborCostInRange,
  getLaborCostPerHourInRange,
  getTotalHoursInRange,
} from "../services/homebase.service.js";
import { LocationService } from "../services/location.service.js";
import {
  getOrderStatsAndSourcesInRange,
  searchOrdersInRange,
  type SourcesOfSalesSegment,
} from "../services/square.service.js";
import type { TimeRange } from "../utils/businessHours.util.js";
import {
  getBusinessStartTimeRange,
  getBusinessHourIndex,
} from "../utils/timezone.util.js";
import { NotFoundError } from "../utils/errors.util.js";

const locationService = new LocationService();

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

    res.status(200).json({
      success: true,
      data: {
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
      },
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
      laborCostPercentPerHour.push(
        sales > 0 ? (labor / sales) * 100 : null,
      );
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

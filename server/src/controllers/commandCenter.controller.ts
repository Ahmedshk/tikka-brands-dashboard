import { Request, Response, NextFunction } from "express";
import { getLaborCostInRange } from "../services/homebase.service.js";
import { GoalService } from "../services/goal.service.js";
import { LocationService } from "../services/location.service.js";
import {
  getNetSalesInRange,
  searchOrdersInRange,
} from "../services/square.service.js";
import type { TimeRange } from "../utils/businessHours.util.js";
import {
  getBusinessStartTimeRange,
  getWeekToDateRange,
  getTodayRangeFullDay,
  getTodayInTimezone,
  getSameDayLastWeekRange,
  getHourInTimezone,
} from "../utils/timezone.util.js";
import { NotFoundError } from "../utils/errors.util.js";
import {
  assertCanAccessMetrics,
  parseMetricsQuery,
} from "../config/kpi-metrics.config.js";

const COMMAND_CENTER_METRICS = [
  "netSales",
  "laborCost",
  "reviewRating",
] as const;

const PERIODS = ["today", "weekToDate"] as const;
type Period = (typeof PERIODS)[number];

function parsePeriodsQuery(periods: unknown): Period[] | undefined {
  if (periods == null) return undefined;
  const raw =
    typeof periods === "string"
      ? periods.split(",").map((x) => x.trim())
      : Array.isArray(periods)
        ? periods.map(String).map((x) => x.trim())
        : [];
  const filtered = raw.filter((p): p is Period =>
    PERIODS.includes(p as Period),
  );
  return filtered.length > 0 ? filtered : undefined;
}

const goalService = new GoalService();
const locationService = new LocationService();

export const getCommandCenterKPIs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId : "";
    const metrics = parseMetricsQuery(req.query.metrics);
    const periods = parsePeriodsQuery(req.query.periods);
    if (metrics?.length) {
      const invalid = metrics.filter(
        (m) =>
          !COMMAND_CENTER_METRICS.includes(
            m as (typeof COMMAND_CENTER_METRICS)[number],
          ),
      );
      if (invalid.length > 0) {
        res.status(400).json({ success: false, message: "Invalid metric" });
        return;
      }
      assertCanAccessMetrics(req.user?.permissions, "command-center", metrics);
    }

    const withCreds = await locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, squareAccessToken, homebaseApiKey } = withCreds;

    const wantNetSales = !metrics?.length || metrics.includes("netSales");
    const wantLaborCost = !metrics?.length || metrics.includes("laborCost");
    const wantReviewRating =
      !metrics?.length || metrics.includes("reviewRating");

    let laborCostGoal = 0;
    if (wantLaborCost) {
      const todayInTz = getTodayInTimezone(location.timezone);
      const result = await goalService.getByLocationIdAndDate(
        locationId,
        todayInTz,
      );
      laborCostGoal = result.goals.laborCostGoal ?? 0;
    }

    const rangeToday: TimeRange = getBusinessStartTimeRange(
      location.timezone,
      location.businessStartTime ?? "00:00",
    );

    const wantWeekToDate =
      Array.isArray(periods) && periods.includes("weekToDate");

    if (wantWeekToDate) {
      const rangeWeekToDate: TimeRange = getWeekToDateRange(
        location.timezone,
        location.businessStartTime ?? "00:00",
      );

      const netSalesPromises: Promise<number | null>[] = [];
      const laborCostPromises: Promise<number | null>[] = [];
      if (wantNetSales && location.squareLocationId?.trim()) {
        netSalesPromises.push(
          getNetSalesInRange(location.squareLocationId, rangeToday, {
            accessToken: squareAccessToken ?? undefined,
          }).catch((err) => {
            console.error(
              "[Command Center] Square net sales (today) error:",
              err,
            );
            return null;
          }),
          getNetSalesInRange(location.squareLocationId, rangeWeekToDate, {
            accessToken: squareAccessToken ?? undefined,
          }).catch((err) => {
            console.error(
              "[Command Center] Square net sales (WTD) error:",
              err,
            );
            return null;
          }),
        );
      } else {
        netSalesPromises.push(Promise.resolve(null), Promise.resolve(null));
      }
      if (wantLaborCost && location.homebaseLocationId?.trim()) {
        laborCostPromises.push(
          getLaborCostInRange(location.homebaseLocationId, rangeToday, {
            apiKey: homebaseApiKey ?? undefined,
          }).catch((err) => {
            console.error(
              "[Command Center] Homebase labor cost (today) error:",
              err,
            );
            return null;
          }),
          getLaborCostInRange(location.homebaseLocationId, rangeWeekToDate, {
            apiKey: homebaseApiKey ?? undefined,
          }).catch((err) => {
            console.error(
              "[Command Center] Homebase labor cost (WTD) error:",
              err,
            );
            return null;
          }),
        );
      } else {
        laborCostPromises.push(Promise.resolve(null), Promise.resolve(null));
      }

      const [netSalesToday, netSalesWeekToDate] =
        netSalesPromises.length >= 2
          ? await Promise.all(netSalesPromises)
          : [null, null];
      const [laborCostToday, laborCostWeekToDate] =
        laborCostPromises.length >= 2
          ? await Promise.all(laborCostPromises)
          : [null, null];

      let laborCostPercentToday: number | null = null;
      let laborCostStatusToday: "green" | "red" | null = null;
      if (
        wantLaborCost &&
        netSalesToday != null &&
        laborCostToday != null &&
        netSalesToday > 0
      ) {
        laborCostPercentToday = (laborCostToday / netSalesToday) * 100;
        laborCostStatusToday =
          laborCostPercentToday < laborCostGoal ? "green" : "red";
      }

      let laborCostPercentWeekToDate: number | null = null;
      let laborCostStatusWeekToDate: "green" | "red" | null = null;
      if (
        wantLaborCost &&
        netSalesWeekToDate != null &&
        laborCostWeekToDate != null &&
        netSalesWeekToDate > 0
      ) {
        laborCostPercentWeekToDate =
          (laborCostWeekToDate / netSalesWeekToDate) * 100;
        laborCostStatusWeekToDate =
          laborCostPercentWeekToDate < laborCostGoal ? "green" : "red";
      }

      const todayData: Record<string, unknown> = {};
      const weekToDateData: Record<string, unknown> = {};
      if (!metrics?.length || metrics.includes("netSales")) {
        todayData.netSalesToday = netSalesToday;
        weekToDateData.netSalesWeekToDate = netSalesWeekToDate;
      }
      if (!metrics?.length || metrics.includes("laborCost")) {
        todayData.laborCostToday = laborCostToday;
        todayData.laborCostPercentToday = laborCostPercentToday;
        todayData.laborCostGoal = laborCostGoal;
        todayData.laborCostStatus = laborCostStatusToday;
        weekToDateData.laborCostWeekToDate = laborCostWeekToDate;
        weekToDateData.laborCostPercentWeekToDate = laborCostPercentWeekToDate;
        weekToDateData.laborCostGoal = laborCostGoal;
        weekToDateData.laborCostStatusWeekToDate = laborCostStatusWeekToDate;
      }
      if (wantReviewRating) {
        todayData.reviewRating = 4.3;
        todayData.reviewCount = 272;
        weekToDateData.reviewRating = 4.3;
        weekToDateData.reviewCount = 272;
      }

      res.status(200).json({
        success: true,
        data: { today: todayData, weekToDate: weekToDateData },
      });
      return;
    }

    let netSalesToday: number | null = null;
    if (wantNetSales && location.squareLocationId?.trim()) {
      try {
        netSalesToday = await getNetSalesInRange(
          location.squareLocationId,
          rangeToday,
          { accessToken: squareAccessToken ?? undefined },
        );
      } catch (err) {
        console.error("[Command Center] Square net sales error:", err);
        netSalesToday = null;
      }
    }

    let laborCostToday: number | null = null;
    if (wantLaborCost && location.homebaseLocationId?.trim()) {
      try {
        laborCostToday = await getLaborCostInRange(
          location.homebaseLocationId,
          rangeToday,
          { apiKey: homebaseApiKey ?? undefined },
        );
      } catch (err) {
        console.error("[Command Center] Homebase labor cost error:", err);
        laborCostToday = null;
      }
    }

    let laborCostPercentToday: number | null = null;
    let laborCostStatus: "green" | "red" | null = null;
    if (
      wantLaborCost &&
      netSalesToday !== null &&
      laborCostToday !== null &&
      netSalesToday > 0
    ) {
      laborCostPercentToday = (laborCostToday / netSalesToday) * 100;
      laborCostStatus = laborCostPercentToday < laborCostGoal ? "green" : "red";
    }

    const data: Record<string, unknown> = {};
    if (!metrics?.length || metrics.includes("netSales")) {
      data.netSalesToday = netSalesToday;
    }
    if (!metrics?.length || metrics.includes("laborCost")) {
      data.laborCostToday = laborCostToday;
      data.laborCostPercentToday = laborCostPercentToday;
      data.laborCostGoal = laborCostGoal;
      data.laborCostStatus = laborCostStatus;
    }
    if (wantReviewRating) {
      data.reviewRating = 4.3;
      data.reviewCount = 272;
    }

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export interface HourlySalesRow {
  hour: string;
  today: number | null;
  last_week: number;
}

export const getHourlySales = async (
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
    const { location, squareAccessToken } = withCreds;
    const timezone = location.timezone?.trim();
    const squareLocationId = location.squareLocationId?.trim();
    if (!timezone || !squareLocationId) {
      res.status(200).json({
        success: true,
        data: buildEmptyHourlySalesRows(),
      });
      return;
    }

    const squareOptions = { accessToken: squareAccessToken ?? undefined };
    const todayRange = getTodayRangeFullDay(timezone);
    const lastWeekRange = getSameDayLastWeekRange(timezone);

    const [todayOrders, lastWeekOrders] = await Promise.all([
      searchOrdersInRange(squareLocationId, todayRange, squareOptions),
      searchOrdersInRange(squareLocationId, lastWeekRange, squareOptions),
    ]);

    const todayBuckets = new Array<number>(24).fill(0);
    const lastWeekBuckets = new Array<number>(24).fill(0);

    for (const order of todayOrders) {
      const hour = getHourInTimezone(order.created_at, timezone);
      if (hour >= 0 && hour < 24) {
        todayBuckets[hour] = (todayBuckets[hour] ?? 0) + order.amountCents;
      }
    }
    for (const order of lastWeekOrders) {
      const hour = getHourInTimezone(order.created_at, timezone);
      if (hour >= 0 && hour < 24) {
        lastWeekBuckets[hour] =
          (lastWeekBuckets[hour] ?? 0) + order.amountCents;
      }
    }

    const rows: HourlySalesRow[] = [];
    for (let h = 0; h < 24; h++) {
      const todayCents = todayBuckets[h] ?? 0;
      const lastWeekCents = lastWeekBuckets[h] ?? 0;
      rows.push({
        hour: `${String(h).padStart(2, "0")}:00`,
        today: todayCents / 100,
        last_week: lastWeekCents / 100,
      });
    }

    res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    next(error);
  }
};

function buildEmptyHourlySalesRows(): HourlySalesRow[] {
  return Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, "0")}:00`,
    today: null,
    last_week: 0,
  }));
}

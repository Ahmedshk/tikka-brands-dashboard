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
  getTodayRangeFullDay,
  getSameDayLastWeekRange,
  getHourInTimezone,
} from "../utils/timezone.util.js";
import { NotFoundError } from "../utils/errors.util.js";

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
    const location = await locationService.getById(locationId);
    if (!location) {
      throw new NotFoundError("Location not found");
    }

    const goals = await goalService.getByLocationId(locationId);
    const laborCostGoal = goals.laborCostGoal ?? 0;

    const range: TimeRange = getBusinessStartTimeRange(
      location.timezone,
      location.businessStartTime,
    );

    let netSalesToday: number | null = null;
    if (location.squareLocationId?.trim()) {
      try {
        netSalesToday = await getNetSalesInRange(
          location.squareLocationId,
          range,
        );
      } catch (err) {
        console.error("[Command Center] Square net sales error:", err);
        netSalesToday = null;
      }
    }

    let laborCostToday: number | null = null;
    if (location.homebaseLocationId?.trim()) {
      try {
        laborCostToday = await getLaborCostInRange(
          location.homebaseLocationId,
          range,
        );
      } catch (err) {
        console.error("[Command Center] Homebase labor cost error:", err);
        laborCostToday = null;
      }
    }

    let laborCostPercentToday: number | null = null;
    let laborCostStatus: "green" | "red" | null = null;
    if (
      netSalesToday !== null &&
      laborCostToday !== null &&
      netSalesToday > 0
    ) {
      laborCostPercentToday = (laborCostToday / netSalesToday) * 100;
      laborCostStatus = laborCostPercentToday < laborCostGoal ? "green" : "red";
    }

    res.status(200).json({
      success: true,
      data: {
        netSalesToday,
        laborCostToday,
        laborCostPercentToday,
        laborCostGoal,
        laborCostStatus,
      },
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
    const location = await locationService.getById(locationId);
    if (!location) {
      throw new NotFoundError("Location not found");
    }
    const timezone = location.timezone?.trim();
    const squareLocationId = location.squareLocationId?.trim();
    if (!timezone || !squareLocationId) {
      res.status(200).json({
        success: true,
        data: buildEmptyHourlySalesRows(),
      });
      return;
    }

    const todayRange = getTodayRangeFullDay(timezone);
    const lastWeekRange = getSameDayLastWeekRange(timezone);

    const [todayOrders, lastWeekOrders] = await Promise.all([
      searchOrdersInRange(squareLocationId, todayRange),
      searchOrdersInRange(squareLocationId, lastWeekRange),
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

import { Request, Response, NextFunction } from "express";
import { getLaborCostInRange } from "../services/homebase.service.js";
import { GoalService } from "../services/goal.service.js";
import { LocationService } from "../services/location.service.js";
import { getNetSalesInRange } from "../services/square.service.js";
import type { TimeRange } from "../utils/businessHours.util.js";
import { getBusinessStartTimeRange } from "../utils/timezone.util.js";
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

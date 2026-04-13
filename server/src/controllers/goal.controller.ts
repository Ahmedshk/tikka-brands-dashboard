import { Request, Response, NextFunction } from "express";
import { GoalService } from "../services/goal.service.js";
import { getGoalDailyActualsByDates } from "../services/goalDailyActuals.service.js";
import { LocationService } from "../services/location.service.js";
import { getTodayInTimezone } from "../utils/timezone.util.js";
import {
  getAllowedGoalMetricKeys,
  sanitizeGoalSetting,
  sanitizeResolvedGoalResult,
  sanitizeGoalDailyActualsByDate,
} from "../utils/goalResponsePermission.util.js";

const goalService = new GoalService();
const locationService = new LocationService();

export const getGoals = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId : "";
    const date =
      typeof req.query.date === "string" && req.query.date.trim()
        ? req.query.date.trim()
        : undefined;

    const allowedKeys = getAllowedGoalMetricKeys(req);

    if (date) {
      const result = await goalService.getByLocationIdAndDate(locationId, date);
      const filtered = sanitizeResolvedGoalResult(result, allowedKeys);
      res.status(200).json({
        success: true,
        data: {
          goals: filtered.goals,
          source: filtered.source,
          ...(filtered.defaultSnapshotEffectiveFrom != null
            ? { defaultSnapshotEffectiveFrom: filtered.defaultSnapshotEffectiveFrom }
            : {}),
        },
      });
    } else {
      const setting = await goalService.getByLocationId(locationId);
      res.status(200).json({
        success: true,
        data: { goals: sanitizeGoalSetting(setting, allowedKeys) },
      });
    }
  } catch (error) {
    next(error);
  }
};

export const getGoalDailyActuals = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId : "";
    const datesRaw =
      typeof req.query.dates === "string" ? req.query.dates : "";
    const dates = datesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const actualsByDate = await getGoalDailyActualsByDates(locationId, dates);
    const allowedKeys = getAllowedGoalMetricKeys(req);
    res.status(200).json({
      success: true,
      data: {
        actualsByDate: sanitizeGoalDailyActualsByDate(actualsByDate, allowedKeys),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const upsertGoals = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { locationId, default: defaultGoals, weekly, futureWeeks } = req.body;
    let defaultEffectiveFrom: string | undefined;
    if (defaultGoals !== undefined) {
      const loc = await locationService.getById(locationId);
      const tz = loc?.timezone?.trim() || "America/Denver";
      defaultEffectiveFrom = getTodayInTimezone(tz);
    }
    const setting = await goalService.upsert(
      locationId,
      {
        default: defaultGoals,
        weekly,
        futureWeeks,
      },
      { defaultEffectiveFrom },
    );
    const allowedKeys = getAllowedGoalMetricKeys(req);
    res.status(200).json({
      success: true,
      message: "Goals saved successfully",
      data: { goals: sanitizeGoalSetting(setting, allowedKeys) },
    });
  } catch (error) {
    next(error);
  }
};

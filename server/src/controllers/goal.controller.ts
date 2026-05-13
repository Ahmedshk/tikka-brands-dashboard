import { Request, Response, NextFunction } from "express";
import { GoalService } from "../services/goal.service.js";
import { getGoalDailyActualsByDates } from "../services/goalDailyActuals.service.js";
import { LocationService } from "../services/location.service.js";
import { getTodayInTimezone } from "../utils/timezone.util.js";
import { isAllLocationsId, resolveEffectiveAllowedLocationIds } from "../utils/locationScope.js";
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
      if (isAllLocationsId(locationId)) {
        const effectiveIds = await resolveEffectiveAllowedLocationIds(req);
        if (effectiveIds.length === 0) {
          res.status(200).json({
            success: true,
            data: {
              goals: sanitizeResolvedGoalResult(
                {
                  goals: {
                    locationId,
                    salesGoal: 0,
                    laborCostGoal: 0,
                    hoursGoal: 0,
                    spmhGoal: 0,
                    foodCostGoal: 0,
                    salesGoalTolerance: 0,
                    laborCostGoalTolerance: 0,
                    hoursGoalTolerance: 0,
                    spmhGoalTolerance: 0,
                    foodCostGoalTolerance: 0,
                  },
                  source: "default",
                },
                allowedKeys,
              ).goals,
              source: "default",
            },
          });
          return;
        }

        const perLoc = await Promise.all(
          effectiveIds.map(async (id) => {
            const loc = await locationService.getById(id);
            const tz = loc?.timezone?.trim() || "America/Denver";
            const today = getTodayInTimezone(tz);
            const result = await goalService.getByLocationIdAndDate(id, today);
            return result.goals;
          }),
        );

        const avg = (vals: Array<number | undefined>) => {
          const nums = vals.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
          if (nums.length === 0) return 0;
          return nums.reduce((a, b) => a + b, 0) / nums.length;
        };

        const mergedGoal = {
          locationId,
          salesGoal: avg(perLoc.map((g) => g.salesGoal)),
          laborCostGoal: avg(perLoc.map((g) => g.laborCostGoal)),
          hoursGoal: avg(perLoc.map((g) => g.hoursGoal)),
          spmhGoal: avg(perLoc.map((g) => g.spmhGoal)),
          foodCostGoal: avg(perLoc.map((g) => g.foodCostGoal)),
          salesGoalTolerance: avg(perLoc.map((g) => g.salesGoalTolerance)),
          laborCostGoalTolerance: avg(perLoc.map((g) => g.laborCostGoalTolerance)),
          hoursGoalTolerance: avg(perLoc.map((g) => g.hoursGoalTolerance)),
          spmhGoalTolerance: avg(perLoc.map((g) => g.spmhGoalTolerance)),
          foodCostGoalTolerance: avg(perLoc.map((g) => g.foodCostGoalTolerance)),
        };

        const filtered = sanitizeResolvedGoalResult(
          { goals: mergedGoal as any, source: "default" },
          allowedKeys,
        );
        res.status(200).json({
          success: true,
          data: {
            goals: filtered.goals,
            source: filtered.source,
          },
        });
        return;
      }
      const result = await goalService.getByLocationIdAndDate(locationId, date);
      const filtered = sanitizeResolvedGoalResult(result, allowedKeys);
      const data: Record<string, unknown> = {
        goals: filtered.goals,
        source: filtered.source,
      };
      if (filtered.defaultSnapshotEffectiveFrom != null) {
        data.defaultSnapshotEffectiveFrom = filtered.defaultSnapshotEffectiveFrom;
      }
      res.status(200).json({
        success: true,
        data,
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
      defaultEffectiveFrom ? { defaultEffectiveFrom } : undefined,
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

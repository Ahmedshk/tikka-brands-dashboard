import { Request, Response, NextFunction } from "express";
import { GoalService } from "../services/goal.service.js";

const goalService = new GoalService();

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

    if (date) {
      const result = await goalService.getByLocationIdAndDate(locationId, date);
      res.status(200).json({
        success: true,
        data: { goals: result.goals, source: result.source },
      });
    } else {
      const setting = await goalService.getByLocationId(locationId);
      res.status(200).json({
        success: true,
        data: { goals: setting },
      });
    }
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
    const setting = await goalService.upsert(locationId, {
      default: defaultGoals,
      weekly,
      futureWeeks,
    });
    res.status(200).json({
      success: true,
      message: "Goals saved successfully",
      data: { goals: setting },
    });
  } catch (error) {
    next(error);
  }
};

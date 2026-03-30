import type { Request, Response, NextFunction } from "express";
import { ActivityLogService } from "../services/activityLog.service.js";

const service = new ActivityLogService();

export async function getActivityLog(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { locationId, date } = req.query as {
      locationId: string;
      date: string;
    };

    const result = await service.getByLocationAndDate(locationId, date);
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (err) {
    next(err);
  }
}

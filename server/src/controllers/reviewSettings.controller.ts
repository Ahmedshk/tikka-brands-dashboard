import type { Request, Response, NextFunction } from "express";
import { ReviewSettingsService } from "../services/reviewSettings.service.js";

const service = new ReviewSettingsService();

export async function getReviewSettings(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const settings = await service.get();
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

export async function updateReviewSettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const updated = await service.upsert(req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

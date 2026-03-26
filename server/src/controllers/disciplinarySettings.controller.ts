import type { Request, Response, NextFunction } from "express";
import { DisciplinarySettingsService } from "../services/disciplinarySettings.service.js";

const service = new DisciplinarySettingsService();

export async function getDisciplinarySettings(
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

export async function updateDisciplinarySettings(
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

import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.util.js";
import { CalendarEventTypeService } from "../services/calendarEventType.service.js";

const service = new CalendarEventTypeService();

function routeParamId(req: Request, name: string): string {
  const raw = req.params[name];
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== "string" || !id) throw new AppError(`Missing ${name}`, 400);
  return id;
}

export async function listCalendarEventTypesActive(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const types = await service.listActive();
    res.json({ success: true, data: { eventTypes: types } });
  } catch (err) {
    next(err);
  }
}

export async function listCalendarEventTypesAll(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const types = await service.listAll();
    res.json({ success: true, data: { eventTypes: types } });
  } catch (err) {
    next(err);
  }
}

export async function createCalendarEventType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const t = await service.create(req.body);
    res.status(201).json({ success: true, data: { eventType: t } });
  } catch (err) {
    next(err);
  }
}

export async function updateCalendarEventType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const t = await service.update(id, req.body);
    res.json({ success: true, data: { eventType: t } });
  } catch (err) {
    next(err);
  }
}

export async function deleteCalendarEventType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    await service.delete(id);
    res.json({ success: true, message: "Event type deleted" });
  } catch (err) {
    next(err);
  }
}

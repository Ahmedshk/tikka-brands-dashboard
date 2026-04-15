import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { CalendarEventService } from "../services/calendarEvent.service.js";
import { IntegratedGoogleCalendarService } from "../services/integratedGoogleCalendar.service.js";
import { getGoogleCalendarServiceAccountEmail } from "../services/googleCalendar.service.js";
import { AppError } from "../utils/errors.util.js";

const integrationService = new IntegratedGoogleCalendarService();
const calendarEventService = new CalendarEventService();

function routeParamId(req: Request, name: string): string {
  const raw = req.params[name];
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== "string" || !id) throw new AppError(`Missing ${name}`, 400);
  return id;
}

export async function listIntegratedGoogleCalendars(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const integrations = await integrationService.listAll();
    res.json({ success: true, data: { integrations } });
  } catch (err) {
    next(err);
  }
}

export async function getIntegratedGoogleCalendarsInfo(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const serviceAccountEmail = getGoogleCalendarServiceAccountEmail();
    const impersonatedUser = process.env.GOOGLE_CALENDAR_IMPERSONATED_USER?.trim() || null;
    res.json({ success: true, data: { serviceAccountEmail, impersonatedUser } });
  } catch (err) {
    next(err);
  }
}

export async function createIntegratedGoogleCalendar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { name, googleCalendarId, description } = req.body as {
      name: string;
      googleCalendarId: string;
      description?: string;
    };
    const integration = await integrationService.create({
      name,
      googleCalendarId,
      ...(description != null && description !== "" ? { description } : {}),
    });
    res.status(201).json({ success: true, data: { integration } });
  } catch (err) {
    next(err);
  }
}

export async function deleteIntegratedGoogleCalendar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError("Invalid integration id", 400);
    }
    const integration = await integrationService.getById(id);
    if (!integration) throw new AppError("Integration not found", 404);

    const { deletedCount } = await calendarEventService.deleteAllForGoogleCalendarId(
      integration.googleCalendarId,
    );
    await integrationService.deleteByMongoId(id);
    res.json({
      success: true,
      message: "Calendar integration removed.",
      data: { deletedEventCount: deletedCount },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateIntegratedGoogleCalendar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const { name, description } = req.body as { name?: string; description?: string };
    const integration = await integrationService.updateById(id, { name, description });
    res.json({ success: true, data: { integration } });
  } catch (err) {
    next(err);
  }
}

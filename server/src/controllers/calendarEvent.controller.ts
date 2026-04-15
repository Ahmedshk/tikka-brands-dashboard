import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { CalendarEventService, type CreateCalendarEventInput } from "../services/calendarEvent.service.js";
import { LocationService } from "../services/location.service.js";
import { AppError } from "../utils/errors.util.js";
import { isAllLocationsId, resolveEffectiveAllowedLocationIds } from "../utils/locationScope.js";

const service = new CalendarEventService();
const locationService = new LocationService();

function routeParamId(req: Request, name: string): string {
  const raw = req.params[name];
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== "string" || !id) throw new AppError(`Missing ${name}`, 400);
  return id;
}

function assertLocationAccess(req: Request, locationId: string): void {
  const allowed = req.user?.allowedLocationIds;
  if (!allowed) return;
  const removals = req.user?.locationRemovals ?? [];
  if (removals.includes(locationId)) {
    throw new AppError("You do not have access to this location.", 403);
  }
  if (allowed === "all") return;
  if (!allowed.includes(locationId)) {
    throw new AppError("You do not have access to this location.", 403);
  }
}

export async function listCalendarEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const locationId = req.query.locationId as string;
    if (isAllLocationsId(locationId)) {
      const effectiveIds = await resolveEffectiveAllowedLocationIds(req);
      const now = new Date();
      const timeMin = (req.query.timeMin as string | undefined)
        ? new Date(req.query.timeMin as string)
        : new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const timeMax = (req.query.timeMax as string | undefined)
        ? new Date(req.query.timeMax as string)
        : new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59, 999);
      const rows = await Promise.all(
        effectiveIds.map(async (id) => {
          assertLocationAccess(req, id);
          const [events, loc] = await Promise.all([
            service.listForLocation(id, timeMin, timeMax),
            locationService.getById(id),
          ]);
          const locationName = loc?.storeName?.trim() || "Location";
          return events.map((ev) => ({ ...ev, locationName }));
        }),
      );
      const events = rows.flat();
      events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      res.json({ success: true, data: { events } });
      return;
    }
    assertLocationAccess(req, locationId);
    const now = new Date();
    const timeMin = (req.query.timeMin as string | undefined)
      ? new Date(req.query.timeMin as string)
      : new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const timeMax = (req.query.timeMax as string | undefined)
      ? new Date(req.query.timeMax as string)
      : new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59, 999);
    const events = await service.listForLocation(locationId, timeMin, timeMax);
    res.json({ success: true, data: { events } });
  } catch (err) {
    next(err);
  }
}

export async function createCalendarEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError("Unauthorized", 401);
    const { title, description, start, end, eventTypeId, locationId, googleCalendarId } = req.body as {
      title: string;
      description?: string;
      start: Date;
      end: Date;
      eventTypeId: string;
      locationId: string;
      googleCalendarId: string;
    };
    assertLocationAccess(req, locationId);
    const createPayload: CreateCalendarEventInput = {
      title,
      start: new Date(start),
      end: new Date(end),
      eventTypeId,
      locationId,
      createdBy: userId,
      googleCalendarId,
    };
    if (description != null && description !== "") createPayload.description = description;
    const event = await service.create(createPayload);
    res.status(201).json({ success: true, data: { event } });
  } catch (err) {
    next(err);
  }
}

export async function updateCalendarEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError("Invalid event id", 400);
    }
    const existing = await service.getById(id);
    if (!existing) throw new AppError("Event not found", 404);
    assertLocationAccess(req, String(existing.locationId));
    const event = await service.update(id, req.body);
    res.json({ success: true, data: { event } });
  } catch (err) {
    next(err);
  }
}

export async function deleteCalendarEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError("Invalid event id", 400);
    }
    const existing = await service.getById(id);
    if (!existing) throw new AppError("Event not found", 404);
    assertLocationAccess(req, String(existing.locationId));
    await service.delete(id);
    res.json({ success: true, message: "Event deleted" });
  } catch (err) {
    next(err);
  }
}

export async function syncCalendarEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { timeMin, timeMax } = req.body as { timeMin: Date; timeMax: Date };
    const result = await service.reconcileRange(new Date(timeMin), new Date(timeMax));
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

import mongoose from "mongoose";
import { CalendarEventModel } from "../models/calendarEvent.model.js";
import { LocationModel } from "../models/location.model.js";
import { AppError } from "../utils/errors.util.js";
import {
  deleteGoogleEvent,
  insertGoogleEvent,
  isGoogleCalendarConfigured,
  listGoogleEventsInRange,
  patchGoogleEvent,
  type GoogleCalendarInsertInput,
  type ParsedGoogleEvent,
} from "./googleCalendar.service.js";
import { CalendarEventTypeService } from "./calendarEventType.service.js";
import type { ICalendarEvent } from "../types/calendar.types.js";
import {
  cancelJobsForEvent,
  rescheduleNotificationJobsForEvent,
  scheduleJobsForEvent,
} from "../utils/calendarNotificationSchedule.util.js";

type SchedulingSlice = {
  start: Date;
  end: Date;
  timeZone: string;
  eventTypeId: mongoose.Types.ObjectId;
  locationId: mongoose.Types.ObjectId;
};

function schedulingFieldsEqual(a: SchedulingSlice, b: SchedulingSlice): boolean {
  return (
    a.start.getTime() === b.start.getTime() &&
    a.end.getTime() === b.end.getTime() &&
    a.timeZone === b.timeZone &&
    a.eventTypeId.equals(b.eventTypeId) &&
    a.locationId.equals(b.locationId)
  );
}

export type CreateCalendarEventInput = {
  title: string;
  start: Date;
  end: Date;
  eventTypeId: string;
  locationId: string;
  createdBy: string;
  description?: string;
};

export class CalendarEventService {
  private readonly typeService = new CalendarEventTypeService();

  async listForLocation(
    locationId: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<ICalendarEvent[]> {
    const rows = await CalendarEventModel.find({
      locationId: new mongoose.Types.ObjectId(locationId),
      start: { $gte: timeMin, $lte: timeMax },
    })
      .sort({ start: 1 })
      .lean();
    return rows.map((r) => {
      const base: ICalendarEvent = {
        _id: r._id.toString(),
        googleEventId: r.googleEventId,
        locationId: r.locationId.toString(),
        eventTypeId: r.eventTypeId.toString(),
        title: r.title,
        start: r.start,
        end: r.end,
        timeZone: r.timeZone,
      };
      if (r.description) base.description = r.description;
      if (r.createdBy) base.createdBy = r.createdBy.toString();
      if (r.lastSyncedAt) base.lastSyncedAt = r.lastSyncedAt;
      if (r.createdAt) base.createdAt = r.createdAt;
      if (r.updatedAt) base.updatedAt = r.updatedAt;
      return base;
    });
  }

  async create(input: CreateCalendarEventInput): Promise<ICalendarEvent> {
    if (!isGoogleCalendarConfigured()) {
      throw new AppError(
        "Google Calendar is not configured on the server. Set credentials and GOOGLE_CALENDAR_ID.",
        503,
      );
    }
    const loc = await LocationModel.findById(input.locationId).lean();
    if (!loc) throw new AppError("Location not found", 404);
    const tz = loc.timezone;
    const type = await this.typeService.getById(input.eventTypeId);
    if (!type?.isActive) throw new AppError("Invalid or inactive event type", 400);

    const googleEventId = await insertGoogleEvent({
      title: input.title,
      ...(input.description != null && input.description !== ""
        ? { description: input.description }
        : {}),
      start: input.start,
      end: input.end,
      timeZone: tz,
      locationId: input.locationId,
      eventTypeId: input.eventTypeId,
    });

    const doc = await CalendarEventModel.create({
      googleEventId,
      locationId: new mongoose.Types.ObjectId(input.locationId),
      eventTypeId: new mongoose.Types.ObjectId(input.eventTypeId),
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      start: input.start,
      end: input.end,
      timeZone: tz,
      createdBy: new mongoose.Types.ObjectId(input.createdBy),
      lastSyncedAt: new Date(),
    });

    const created: ICalendarEvent = {
      _id: doc._id.toString(),
      googleEventId: doc.googleEventId,
      locationId: doc.locationId.toString(),
      eventTypeId: doc.eventTypeId.toString(),
      title: doc.title,
      start: doc.start,
      end: doc.end,
      timeZone: doc.timeZone,
    };
    if (doc.description) created.description = doc.description;
    if (doc.createdBy) created.createdBy = doc.createdBy.toString();
    if (doc.lastSyncedAt) created.lastSyncedAt = doc.lastSyncedAt;
    await scheduleJobsForEvent(doc._id.toString());
    return created;
  }

  async update(
    id: string,
    input: Partial<{
      title: string;
      description: string;
      start: Date;
      end: Date;
      eventTypeId: string;
    }>,
  ): Promise<ICalendarEvent> {
    const existing = await CalendarEventModel.findById(id);
    if (!existing) throw new AppError("Event not found", 404);

    if (input.eventTypeId) {
      const type = await this.typeService.getById(input.eventTypeId);
      if (!type?.isActive) throw new AppError("Invalid or inactive event type", 400);
      existing.eventTypeId = new mongoose.Types.ObjectId(input.eventTypeId);
    }
    if (input.title != null) existing.title = input.title.trim();
    if (input.description != null) existing.description = input.description.trim();
    if (input.start != null) existing.start = input.start;
    if (input.end != null) existing.end = input.end;

    if (isGoogleCalendarConfigured()) {
      const patch: Partial<GoogleCalendarInsertInput> = {
        title: existing.title,
        start: existing.start,
        end: existing.end,
        timeZone: existing.timeZone,
        locationId: existing.locationId.toString(),
        eventTypeId: existing.eventTypeId.toString(),
      };
      if (existing.description) patch.description = existing.description;
      await patchGoogleEvent(existing.googleEventId, patch);
    }

    existing.lastSyncedAt = new Date();
    await existing.save();

    const updated: ICalendarEvent = {
      _id: existing._id.toString(),
      googleEventId: existing.googleEventId,
      locationId: existing.locationId.toString(),
      eventTypeId: existing.eventTypeId.toString(),
      title: existing.title,
      start: existing.start,
      end: existing.end,
      timeZone: existing.timeZone,
      lastSyncedAt: existing.lastSyncedAt,
    };
    if (existing.description) updated.description = existing.description;
    if (existing.createdBy) updated.createdBy = existing.createdBy.toString();
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await CalendarEventModel.findById(id);
    if (!existing) throw new AppError("Event not found", 404);
    await cancelJobsForEvent(existing._id.toString());
    if (isGoogleCalendarConfigured()) {
      await deleteGoogleEvent(existing.googleEventId);
    }
    await CalendarEventModel.deleteOne({ _id: existing._id });
  }

  async upsertFromParsed(
    parsed: ParsedGoogleEvent,
    createdBy?: mongoose.Types.ObjectId,
  ): Promise<{ rescheduled: boolean }> {
    if (!parsed.locationId || !parsed.eventTypeId) return { rescheduled: false };
    const loc = await LocationModel.findById(parsed.locationId).lean();
    if (!loc) return { rescheduled: false };
    const typeOk = await this.typeService.getById(parsed.eventTypeId);
    if (!typeOk) return { rescheduled: false };

    const before = await CalendarEventModel.findOne({ googleEventId: parsed.googleEventId }).lean();

    const after = await CalendarEventModel.findOneAndUpdate(
      { googleEventId: parsed.googleEventId },
      {
        $set: {
          locationId: new mongoose.Types.ObjectId(parsed.locationId),
          eventTypeId: new mongoose.Types.ObjectId(parsed.eventTypeId),
          title: parsed.title,
          description: parsed.description,
          start: parsed.start,
          end: parsed.end,
          timeZone: parsed.timeZone,
          lastSyncedAt: new Date(),
          ...(createdBy ? { createdBy } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    if (!after) return { rescheduled: false };

    const inserted = !before;
    const afterSlice: SchedulingSlice = {
      start: after.start,
      end: after.end,
      timeZone: after.timeZone,
      eventTypeId: after.eventTypeId,
      locationId: after.locationId,
    };
    let changed = inserted;
    if (!inserted && before) {
      const beforeSlice: SchedulingSlice = {
        start: before.start,
        end: before.end,
        timeZone: before.timeZone,
        eventTypeId: before.eventTypeId,
        locationId: before.locationId,
      };
      changed = !schedulingFieldsEqual(beforeSlice, afterSlice);
    }

    if (changed) {
      await rescheduleNotificationJobsForEvent(after._id.toString());
      return { rescheduled: true };
    }
    return { rescheduled: false };
  }

  async reconcileRange(
    timeMin: Date,
    timeMax: Date,
  ): Promise<{ upserted: number; rescheduled: number }> {
    if (!isGoogleCalendarConfigured()) return { upserted: 0, rescheduled: 0 };
    const list = await listGoogleEventsInRange(timeMin, timeMax);
    let rescheduled = 0;
    let n = 0;
    for (const ev of list) {
      const r = await this.upsertFromParsed(ev);
      if (r.rescheduled) rescheduled += 1;
      n += 1;
    }
    return { upserted: n, rescheduled };
  }

  async getById(id: string): Promise<ICalendarEvent | null> {
    const r = await CalendarEventModel.findById(id).lean();
    if (!r) return null;
    const ev: ICalendarEvent = {
      _id: r._id.toString(),
      googleEventId: r.googleEventId,
      locationId: r.locationId.toString(),
      eventTypeId: r.eventTypeId.toString(),
      title: r.title,
      start: r.start,
      end: r.end,
      timeZone: r.timeZone,
    };
    if (r.description) ev.description = r.description;
    if (r.createdBy) ev.createdBy = r.createdBy.toString();
    if (r.lastSyncedAt) ev.lastSyncedAt = r.lastSyncedAt;
    return ev;
  }
}

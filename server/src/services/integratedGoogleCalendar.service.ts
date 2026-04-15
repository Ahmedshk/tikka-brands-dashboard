import mongoose from "mongoose";
import { IntegratedGoogleCalendarModel } from "../models/integratedGoogleCalendar.model.js";
import { AppError } from "../utils/errors.util.js";
import { assertGoogleCalendarAccessible } from "./googleCalendar.service.js";

export interface IntegratedGoogleCalendarDto {
  _id: string;
  name: string;
  googleCalendarId: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(doc: {
  _id: mongoose.Types.ObjectId;
  name: string;
  googleCalendarId: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}): IntegratedGoogleCalendarDto {
  return {
    _id: doc._id.toString(),
    name: doc.name,
    googleCalendarId: doc.googleCalendarId,
    description: doc.description?.trim() ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class IntegratedGoogleCalendarService {
  async listAll(): Promise<IntegratedGoogleCalendarDto[]> {
    const rows = await IntegratedGoogleCalendarModel.find().sort({ createdAt: 1 }).lean();
    return rows.map((r) =>
      toDto({
        _id: r._id,
        name: r.name,
        googleCalendarId: r.googleCalendarId,
        description: r.description,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }),
    );
  }

  async listGoogleCalendarIds(): Promise<string[]> {
    const rows = await IntegratedGoogleCalendarModel.find().sort({ createdAt: 1 }).select("googleCalendarId").lean();
    return rows.map((r) => r.googleCalendarId);
  }

  async listGoogleCalendarsMinimal(): Promise<Array<{ googleCalendarId: string; name: string }>> {
    const rows = await IntegratedGoogleCalendarModel.find()
      .sort({ createdAt: 1 })
      .select("googleCalendarId name")
      .lean();
    return rows.map((r) => ({ googleCalendarId: r.googleCalendarId, name: r.name }));
  }

  async isIntegratedGoogleCalendarId(googleCalendarId: string): Promise<boolean> {
    const n = await IntegratedGoogleCalendarModel.countDocuments({ googleCalendarId: googleCalendarId.trim() });
    return n > 0;
  }

  async create(input: { name: string; googleCalendarId: string; description?: string }): Promise<IntegratedGoogleCalendarDto> {
    const name = input.name.trim();
    if (!name) throw new AppError("Calendar name is required.", 400);
    if (name.length > 200) throw new AppError("Calendar name must be at most 200 characters.", 400);
    const googleCalendarId = input.googleCalendarId.trim();
    if (!googleCalendarId) throw new AppError("Google Calendar id is required.", 400);
    const description = input.description?.trim() ?? "";
    if (description.length > 500) throw new AppError("Description must be at most 500 characters.", 400);
    if (googleCalendarId.length > 1024) throw new AppError("Google Calendar id is too long.", 400);

    const dup = await IntegratedGoogleCalendarModel.findOne({ googleCalendarId }).lean();
    if (dup) throw new AppError("This Google Calendar is already integrated.", 409);

    await assertGoogleCalendarAccessible(googleCalendarId);

    const doc = await IntegratedGoogleCalendarModel.create({
      name,
      googleCalendarId,
      description,
    });
    return toDto(doc);
  }

  async getById(id: string): Promise<IntegratedGoogleCalendarDto | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await IntegratedGoogleCalendarModel.findById(id).lean();
    if (!doc) return null;
    return toDto({
      _id: doc._id,
      name: doc.name,
      googleCalendarId: doc.googleCalendarId,
      description: doc.description,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }

  async deleteByMongoId(id: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid integration id", 400);
    const res = await IntegratedGoogleCalendarModel.deleteOne({ _id: id });
    if (res.deletedCount === 0) throw new AppError("Integration not found", 404);
  }

  async updateById(
    id: string,
    input: Partial<{ name: string; description: string }>,
  ): Promise<IntegratedGoogleCalendarDto> {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid integration id", 400);
    const existing = await IntegratedGoogleCalendarModel.findById(id);
    if (!existing) throw new AppError("Integration not found", 404);

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new AppError("Calendar name is required.", 400);
      if (name.length > 200) throw new AppError("Calendar name must be at most 200 characters.", 400);
      existing.name = name;
    }
    if (input.description !== undefined) {
      const description = input.description.trim();
      if (description.length > 500) throw new AppError("Description must be at most 500 characters.", 400);
      existing.description = description;
    }

    await existing.save();
    return toDto(existing);
  }
}

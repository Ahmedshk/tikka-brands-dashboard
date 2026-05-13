import { CalendarEventTypeModel } from "../models/calendarEventType.model.js";
import { AppError } from "../utils/errors.util.js";
import {
  applyReminderPolicyPatch,
  mergeReminderPolicy,
} from "../utils/calendarReminderPolicy.util.js";
import {
  DEFAULT_CALENDAR_REMINDER_POLICY,
  type ICalendarEventType,
  type ICalendarReminderPolicy,
} from "../types/calendar.types.js";

const DEFAULT_TYPES: Omit<ICalendarEventType, "_id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Manager Meeting",
    slug: "manager-meeting",
    colorHex: "#FBC52A4D",
    sortOrder: 0,
    isActive: true,
    reminderPolicy: { ...DEFAULT_CALENDAR_REMINDER_POLICY },
  },
  {
    name: "Catering",
    slug: "catering",
    colorHex: "#5DC54F4D",
    sortOrder: 1,
    isActive: true,
    reminderPolicy: { ...DEFAULT_CALENDAR_REMINDER_POLICY },
  },
  {
    name: "Delivery",
    slug: "delivery",
    colorHex: "#009BBE4D",
    sortOrder: 2,
    isActive: true,
    reminderPolicy: { ...DEFAULT_CALENDAR_REMINDER_POLICY },
  },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replaceAll(/[^\w\s-]/g, "")
    .replaceAll(/[\s_-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

type LeanEventType = {
  _id: { toString: () => string };
  name: string;
  slug: string;
  colorHex: string;
  sortOrder: number;
  isActive: boolean;
  reminderPolicy?: Partial<ICalendarReminderPolicy> | null;
  createdAt?: Date;
  updatedAt?: Date;
};

function toDto(d: LeanEventType): ICalendarEventType {
  const out: ICalendarEventType = {
    _id: d._id.toString(),
    name: d.name,
    slug: d.slug,
    colorHex: d.colorHex,
    sortOrder: d.sortOrder,
    isActive: d.isActive,
    reminderPolicy: mergeReminderPolicy(d.reminderPolicy),
  };
  if (d.createdAt !== undefined) out.createdAt = d.createdAt;
  if (d.updatedAt !== undefined) out.updatedAt = d.updatedAt;
  return out;
}

export class CalendarEventTypeService {
  async ensureDefaults(): Promise<void> {
    const count = await CalendarEventTypeModel.countDocuments();
    if (count > 0) return;
    await CalendarEventTypeModel.insertMany(DEFAULT_TYPES);
  }

  async listActive(): Promise<ICalendarEventType[]> {
    await this.ensureDefaults();
    const docs = await CalendarEventTypeModel.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
    return docs.map((d) => toDto(d as LeanEventType));
  }

  async listAll(): Promise<ICalendarEventType[]> {
    await this.ensureDefaults();
    const docs = await CalendarEventTypeModel.find().sort({ sortOrder: 1, name: 1 }).lean();
    return docs.map((d) => toDto(d as LeanEventType));
  }

  async create(body: {
    name: string;
    colorHex?: string;
    sortOrder?: number;
    isActive?: boolean;
    reminderPolicy?: Partial<ICalendarReminderPolicy>;
  }): Promise<ICalendarEventType> {
    await this.ensureDefaults();
    const slug = slugify(body.name);
    const exists = await CalendarEventTypeModel.findOne({ slug });
    if (exists) throw new AppError("An event type with this name already exists", 409);
    const reminderPolicy = mergeReminderPolicy(body.reminderPolicy);
    const doc = await CalendarEventTypeModel.create({
      name: body.name.trim(),
      slug,
      colorHex: body.colorHex?.trim() ?? "#6B7280",
      sortOrder: body.sortOrder ?? 0,
      isActive: body.isActive ?? true,
      reminderPolicy,
    });
    return toDto(doc.toObject() as LeanEventType);
  }

  async update(
    id: string,
    body: Partial<{
      name: string;
      colorHex: string;
      sortOrder: number;
      isActive: boolean;
      reminderPolicy: Partial<ICalendarReminderPolicy>;
    }>,
  ): Promise<ICalendarEventType> {
    const doc = await CalendarEventTypeModel.findById(id);
    if (!doc) throw new AppError("Event type not found", 404);
    if (body.name != null) {
      doc.name = body.name.trim();
      doc.slug = slugify(body.name);
    }
    if (body.colorHex != null) doc.colorHex = body.colorHex.trim();
    if (body.sortOrder != null) doc.sortOrder = body.sortOrder;
    if (body.isActive != null) doc.isActive = body.isActive;
    if (body.reminderPolicy !== undefined) {
      const current = mergeReminderPolicy(doc.reminderPolicy as Partial<ICalendarReminderPolicy> | undefined);
      doc.reminderPolicy = applyReminderPolicyPatch(current, body.reminderPolicy) as never;
    }
    await doc.save();
    return toDto(doc.toObject() as LeanEventType);
  }

  async delete(id: string): Promise<void> {
    const res = await CalendarEventTypeModel.deleteOne({ _id: id });
    if (res.deletedCount === 0) throw new AppError("Event type not found", 404);
  }

  async getById(id: string): Promise<ICalendarEventType | null> {
    const d = await CalendarEventTypeModel.findById(id).lean();
    if (!d) return null;
    return toDto(d as LeanEventType);
  }
}

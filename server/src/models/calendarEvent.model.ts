import mongoose, { Schema, Document, Types } from "mongoose";

export interface CalendarEventDocument extends Document {
  _id: Types.ObjectId;
  /** Google Calendar id (e.g. email or calendar-specific id) this event belongs to. */
  googleCalendarId: string;
  googleEventId: string;
  locationId: Types.ObjectId;
  eventTypeId: Types.ObjectId;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  timeZone: string;
  createdBy?: Types.ObjectId;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const calendarEventSchema = new Schema<CalendarEventDocument>(
  {
    googleCalendarId: { type: String, required: true, trim: true, index: true },
    googleEventId: { type: String, required: true, trim: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true, index: true },
    eventTypeId: { type: Schema.Types.ObjectId, ref: "CalendarEventType", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    start: { type: Date, required: true, index: true },
    end: { type: Date, required: true },
    timeZone: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    lastSyncedAt: { type: Date, default: undefined },
  },
  { timestamps: true },
);

calendarEventSchema.index({ locationId: 1, start: 1 });
calendarEventSchema.index({ googleCalendarId: 1, googleEventId: 1 }, { unique: true });

export const CalendarEventModel = mongoose.model<CalendarEventDocument>(
  "CalendarEvent",
  calendarEventSchema,
);

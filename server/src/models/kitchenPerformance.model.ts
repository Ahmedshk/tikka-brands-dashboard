import mongoose, { Schema, Document, Types } from "mongoose";

export interface KitchenPerformanceRowSubdocument {
  deviceName: string;
  type?: string;
  completedTickets: number;
  avgCompletionTimeSeconds: number;
}

export interface KitchenPerformanceRawTicketSubdocument {
  deviceName: string | null;
  ticketName: string | null;
  orderSource: string | null;
  numberOfItems: number | null;
  itemsInTicket: string | null;
  completionTimeSeconds: number | null;
  timeCreated: string | null;
  timeCompleted: string | null;
  timeDue: string | null;
  timeRecalled: string | null;
}

export interface KitchenPerformanceDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  reportDate: string;
  rows: KitchenPerformanceRowSubdocument[];
  rawTickets: KitchenPerformanceRawTicketSubdocument[];
  uploadedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const kitchenPerformanceRowSchema = new Schema<KitchenPerformanceRowSubdocument>(
  {
    deviceName: { type: String, required: true, trim: true },
    type: { type: String, required: false, trim: true, default: "Unknown" },
    completedTickets: { type: Number, required: true, min: 0, default: 0 },
    avgCompletionTimeSeconds: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const kitchenPerformanceRawTicketSchema =
  new Schema<KitchenPerformanceRawTicketSubdocument>(
    {
      deviceName: { type: String, required: false, trim: true, default: null },
      ticketName: { type: String, required: false, trim: true, default: null },
      orderSource: { type: String, required: false, trim: true, default: null },
      numberOfItems: { type: Number, required: false, min: 0, default: null },
      itemsInTicket: { type: String, required: false, trim: true, default: null },
      completionTimeSeconds: {
        type: Number,
        required: false,
        min: 0,
        default: null,
      },
      timeCreated: { type: String, required: false, trim: true, default: null },
      timeCompleted: { type: String, required: false, trim: true, default: null },
      timeDue: { type: String, required: false, trim: true, default: null },
      timeRecalled: { type: String, required: false, trim: true, default: null },
    },
    { _id: false },
  );

const kitchenPerformanceSchema = new Schema<KitchenPerformanceDocument>(
  {
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    reportDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    rows: { type: [kitchenPerformanceRowSchema], default: [] },
    rawTickets: { type: [kitchenPerformanceRawTicketSchema], default: [] },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

kitchenPerformanceSchema.index({ locationId: 1, reportDate: 1 }, { unique: true });

export const KitchenPerformanceModel = mongoose.model<KitchenPerformanceDocument>(
  "KitchenPerformance",
  kitchenPerformanceSchema,
);

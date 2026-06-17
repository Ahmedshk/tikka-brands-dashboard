import mongoose, { Schema, Document, Types } from "mongoose";

export type SquareOrderNoteHistorySource = "dashboard" | "square";

export interface SquareOrderNoteHistoryEntry {
  note: string;
  updatedAt: Date;
  updatedByUserId?: Types.ObjectId;
  updatedByName: string;
  updatedByRole: string;
  source: SquareOrderNoteHistorySource;
}

export interface SquareOrderNoteDocument extends Document {
  _id: Types.ObjectId;
  squareOrderId: string;
  locationId: Types.ObjectId;
  currentNote: string;
  history: SquareOrderNoteHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const historyEntrySchema = new Schema<SquareOrderNoteHistoryEntry>(
  {
    note: { type: String, required: true },
    updatedAt: { type: Date, required: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    updatedByName: { type: String, required: true, trim: true },
    updatedByRole: { type: String, required: true, trim: true },
    source: { type: String, enum: ["dashboard", "square"], required: true },
  },
  { _id: false },
);

const squareOrderNoteSchema = new Schema<SquareOrderNoteDocument>(
  {
    squareOrderId: { type: String, required: true, trim: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    currentNote: { type: String, default: "" },
    history: { type: [historyEntrySchema], default: [] },
  },
  { timestamps: true },
);

squareOrderNoteSchema.index({ squareOrderId: 1, locationId: 1 }, { unique: true });
squareOrderNoteSchema.index({ locationId: 1, squareOrderId: 1 });

export const SquareOrderNoteModel = mongoose.model<SquareOrderNoteDocument>(
  "SquareOrderNote",
  squareOrderNoteSchema,
);

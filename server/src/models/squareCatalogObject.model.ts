import mongoose, { Schema, Document, Types } from "mongoose";

export interface SquareCatalogObjectDocument extends Document {
  _id: Types.ObjectId;
  /** Square catalog object id */
  objectId: string;
  version?: number;
  locationId: Types.ObjectId;
  raw: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const squareCatalogObjectSchema = new Schema<SquareCatalogObjectDocument>(
  {
    objectId: { type: String, required: true, trim: true },
    version: { type: Number, required: false },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    raw: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

squareCatalogObjectSchema.index({ objectId: 1, locationId: 1 }, { unique: true });
squareCatalogObjectSchema.index({ locationId: 1, updatedAt: -1 });

export const SquareCatalogObjectModel = mongoose.model<SquareCatalogObjectDocument>(
  "SquareCatalogObject",
  squareCatalogObjectSchema,
);

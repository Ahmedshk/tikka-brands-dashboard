import mongoose, { Schema, Document, Types } from 'mongoose';
import { ILocationGroup } from '../types/locationGroup.types.js';

export interface LocationGroupDocument
  extends Omit<ILocationGroup, '_id' | 'createdAt' | 'updatedAt'>, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const locationGroupSchema = new Schema<LocationGroupDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    /** Display order (ascending) of the group headers. New groups append. */
    sortOrder: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Case-insensitive uniqueness: "West Coast" and "west coast" collide, since two
// identically-named headers in the selector would be indistinguishable. The
// service translates the resulting E11000 into a 409 ConflictError.
locationGroupSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);
locationGroupSchema.index({ sortOrder: 1 });

export const LocationGroupModel = mongoose.model<LocationGroupDocument>(
  'LocationGroup',
  locationGroupSchema,
);

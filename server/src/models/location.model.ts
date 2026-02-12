import mongoose, { Schema, Document, Types } from 'mongoose';
import { ILocation } from '../types/location.types.js';

export interface LocationDocument extends Omit<ILocation, '_id' | 'createdAt' | 'updatedAt'>, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const locationSchema = new Schema<LocationDocument>(
  {
    storeName: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    squareLocationId: {
      type: String,
      required: true,
      trim: true,
    },
    homebaseLocationId: {
      type: String,
      required: true,
      trim: true,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
    },
    businessStartTime: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const LocationModel = mongoose.model<LocationDocument>('Location', locationSchema);

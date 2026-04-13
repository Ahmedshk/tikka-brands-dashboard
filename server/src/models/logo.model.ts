import mongoose, { Schema, Document, Types } from 'mongoose';
import { ILogo } from '../types/logo.types.js';

export interface LogoDocument extends Omit<ILogo, '_id' | 'createdAt' | 'updatedAt'>, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const logoSchema = new Schema<LogoDocument>(
  {
    url: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: false,
      trim: true,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

export const LogoModel = mongoose.model<LogoDocument>('Logo', logoSchema);

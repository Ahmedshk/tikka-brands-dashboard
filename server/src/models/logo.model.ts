import mongoose, { Schema, Document, Types } from 'mongoose';
import { ILogo } from '../types/logo.types.js';

export interface LogoDocument extends Omit<ILogo, '_id' | 'createdAt' | 'updatedAt'>, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const logoSchema = new Schema<LogoDocument>(
  {
    dataUrl: {
      type: String,
      required: true,
    },
    contentType: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

export const LogoModel = mongoose.model<LogoDocument>('Logo', logoSchema);

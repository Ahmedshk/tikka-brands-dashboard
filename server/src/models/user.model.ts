import mongoose, { Schema, Document, Types } from 'mongoose';
import { IUser } from '../types/user.types.js';

export interface UserDocument extends Omit<IUser, '_id' | 'createdAt' | 'updatedAt'>, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  // Helper method to convert _id to string
  toObject(): Omit<IUser, 'password'> & { _id: string; createdAt: Date; updatedAt: Date };
}

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // Don't return password by default
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      default: null,
    },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['pending', 'active'],
      default: 'active',
    },
    invitationSentAt: { type: Date, default: undefined },
    invitationToken: { type: String, trim: true, default: undefined },
    invitationTokenExpiresAt: { type: Date, default: undefined },
    phone: { type: String, trim: true, default: undefined },
    squareId: { type: String, trim: true, default: undefined },
    homebaseId: { type: String, trim: true, default: undefined },
    profileImagePublicId: { type: String, trim: true, default: undefined },
  },
  {
    timestamps: true,
  }
);

export const UserModel = mongoose.model<UserDocument>('User', userSchema);

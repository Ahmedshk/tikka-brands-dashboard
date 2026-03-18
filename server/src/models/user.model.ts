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
    homebaseData: {
      type: {
        id: { type: String, required: true, trim: true },
        job: {
          type: {
            id: Number,
            level: String,
            default_role: String,
            pos_partner_id: String,
            payroll_id: String,
            wage_rate: Schema.Types.Mixed,
            wage_type: String,
            roles: [Schema.Types.Mixed],
            archived_at: String,
            location_uuid: String,
          },
          _id: false,
        },
        created_at: Date,
        updated_at: Date,
      },
      _id: false,
      default: undefined,
    },
    profileImagePublicId: { type: String, trim: true, default: undefined },
    permissionOverrides: {
      type: {
        type: String,
        enum: ['custom'],
        required: false,
      },
      pages: [
        {
          pageId: { type: String, required: true },
          pageLabel: { type: String, required: true },
          components: [{ type: String }],
        },
      ],
      _id: false,
    },
    locationOverrides: {
      type: [Schema.Types.ObjectId],
      ref: 'Location',
      default: undefined,
    },
    permissionRemovals: {
      type: {
        type: String,
        enum: ['custom'],
        required: false,
      },
      pages: [
        {
          pageId: { type: String, required: true },
          pageLabel: { type: String, required: true },
          components: [{ type: String }],
        },
      ],
      _id: false,
    },
    locationRemovals: {
      type: [Schema.Types.ObjectId],
      ref: 'Location',
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

export const UserModel = mongoose.model<UserDocument>('User', userSchema);

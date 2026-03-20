import mongoose, { Schema, Document, Types } from "mongoose";
import {
  NOTIFICATION_TYPES,
  type NotificationType,
} from "../types/notification.types.js";

export interface NotificationDocument extends Document {
  _id: Types.ObjectId;
  recipientId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: undefined },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: undefined },
  },
  { timestamps: true },
);

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

export const NotificationModel = mongoose.model<NotificationDocument>(
  "Notification",
  notificationSchema,
);

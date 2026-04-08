import mongoose, { Schema, Document, Types } from "mongoose";

export interface CommandCenterAlertDismissalDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  notificationId: Types.ObjectId;
  createdAt: Date;
}

const commandCenterAlertDismissalSchema = new Schema<CommandCenterAlertDismissalDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    notificationId: { type: Schema.Types.ObjectId, ref: "Notification", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

commandCenterAlertDismissalSchema.index({ userId: 1, notificationId: 1 }, { unique: true });

export const CommandCenterAlertDismissalModel =
  mongoose.model<CommandCenterAlertDismissalDocument>(
    "CommandCenterAlertDismissal",
    commandCenterAlertDismissalSchema,
  );

import mongoose, { Schema, Document, Types } from "mongoose";
import { QUESTION_TYPES, type IQuestion } from "../types/reviewSettings.types.js";

export interface ReviewSettingsDocument extends Document {
  _id: Types.ObjectId;
  employeeRoleIds: Types.ObjectId[];
  managerRoleIds: Types.ObjectId[];
  directorRoleIds: Types.ObjectId[];
  selfReviewQuestionnaire: IQuestion[];
  managerReviewQuestionnaire: IQuestion[];
  checkInQuestionnaire: IQuestion[];
  isConfigured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<IQuestion>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    options: { type: [String], default: undefined },
    required: { type: Boolean, default: true },
    order: { type: Number, required: true },
  },
  { _id: false },
);

const reviewSettingsSchema = new Schema<ReviewSettingsDocument>(
  {
    employeeRoleIds: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    managerRoleIds: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    directorRoleIds: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    selfReviewQuestionnaire: { type: [questionSchema], default: [] },
    managerReviewQuestionnaire: { type: [questionSchema], default: [] },
    checkInQuestionnaire: { type: [questionSchema], default: [] },
    isConfigured: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const ReviewSettingsModel = mongoose.model<ReviewSettingsDocument>(
  "ReviewSettings",
  reviewSettingsSchema,
);

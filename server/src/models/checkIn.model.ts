import mongoose, { Schema, Document, Types } from "mongoose";
import type { QuestionResponse } from "../types/reviewCycle.types.js";

export interface CheckInDocument extends Document {
  _id: Types.ObjectId;
  reviewCycleId: Types.ObjectId;
  period: "30" | "60";
  managerId: Types.ObjectId;
  employeeId: Types.ObjectId;
  responses: QuestionResponse[];
  documentUrl?: string;
  documentPublicId?: string;
  documents?: {
    url?: string;
    publicId: string;
    filename?: string;
    resourceType?: string;
    format?: string;
  }[];
  managerComments?: string;
  actionPlanProgress?: string;
  actionItemProgress?: {
    actionPlanItemIndex: number;
    value?: string;
  }[];
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const questionResponseSchema = new Schema<QuestionResponse>(
  {
    questionId: { type: String, required: true },
    questionText: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { _id: false },
);

const checkInSchema = new Schema<CheckInDocument>(
  {
    reviewCycleId: { type: Schema.Types.ObjectId, ref: "ReviewCycle", required: true },
    period: { type: String, enum: ["30", "60"], required: true },
    managerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    responses: { type: [questionResponseSchema], required: true },
    documentUrl: { type: String, default: undefined },
    documentPublicId: { type: String, default: undefined },
    documents: {
      type: [
        {
          url: { type: String, default: undefined },
          publicId: { type: String, required: true },
          filename: { type: String, default: undefined },
          resourceType: { type: String, default: undefined },
          format: { type: String, default: undefined },
        },
      ],
      default: [],
    },
    managerComments: { type: String, default: undefined },
    actionPlanProgress: { type: String, default: undefined },
    actionItemProgress: {
      type: [
        {
          actionPlanItemIndex: { type: Number, required: true },
          value: { type: String, default: undefined },
        },
      ],
      default: [],
    },
    submittedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

checkInSchema.index({ reviewCycleId: 1, period: 1 }, { unique: true });

export const CheckInModel = mongoose.model<CheckInDocument>(
  "CheckIn",
  checkInSchema,
);

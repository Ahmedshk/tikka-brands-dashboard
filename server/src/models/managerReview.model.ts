import mongoose, { Schema, Document, Types } from "mongoose";
import type { QuestionResponse } from "../types/reviewCycle.types.js";

export interface ManagerReviewDocument extends Document {
  _id: Types.ObjectId;
  reviewCycleId: Types.ObjectId;
  managerId: Types.ObjectId;
  employeeId: Types.ObjectId;
  responses: QuestionResponse[];
  revisionHistory: { responses: QuestionResponse[]; updatedAt: Date }[];
  submittedAt: Date;
  lastUpdatedAt?: Date;
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

const managerReviewSchema = new Schema<ManagerReviewDocument>(
  {
    reviewCycleId: { type: Schema.Types.ObjectId, ref: "ReviewCycle", required: true },
    managerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    responses: { type: [questionResponseSchema], required: true },
    revisionHistory: {
      type: [
        {
          responses: { type: [questionResponseSchema], required: true },
          updatedAt: { type: Date, required: true },
        },
      ],
      default: [],
    },
    submittedAt: { type: Date, required: true },
    lastUpdatedAt: { type: Date, default: undefined },
  },
  { timestamps: true },
);

managerReviewSchema.index({ reviewCycleId: 1 }, { unique: true });

export const ManagerReviewModel = mongoose.model<ManagerReviewDocument>(
  "ManagerReview",
  managerReviewSchema,
);

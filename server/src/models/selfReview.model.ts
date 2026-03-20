import mongoose, { Schema, Document, Types } from "mongoose";
import type { QuestionResponse } from "../types/reviewCycle.types.js";

export interface SelfReviewDocument extends Document {
  _id: Types.ObjectId;
  reviewCycleId: Types.ObjectId;
  employeeId: Types.ObjectId;
  responses: QuestionResponse[];
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

const selfReviewSchema = new Schema<SelfReviewDocument>(
  {
    reviewCycleId: { type: Schema.Types.ObjectId, ref: "ReviewCycle", required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    responses: { type: [questionResponseSchema], required: true },
    submittedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

selfReviewSchema.index({ reviewCycleId: 1 }, { unique: true });

export const SelfReviewModel = mongoose.model<SelfReviewDocument>(
  "SelfReview",
  selfReviewSchema,
);

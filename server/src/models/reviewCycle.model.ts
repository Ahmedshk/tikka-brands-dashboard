import mongoose, { Schema, Document, Types } from "mongoose";
import {
  REVIEW_CYCLE_STATUSES,
  type ReviewCycleStatus,
  type SalaryIncrementType,
} from "../types/reviewCycle.types.js";

export interface ReviewCycleDocument extends Document {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  cycleNumber: number;
  referenceDate: Date;
  status: ReviewCycleStatus;
  /** Unique token for public self-review link; sent in email. Cleared after submit or expiry. */
  selfReviewToken?: string;
  /** When the self-review link expires. */
  selfReviewTokenExpiresAt?: Date;
  selfReviewId?: Types.ObjectId;
  managerReviewId?: Types.ObjectId;
  reviewedByManagerId?: Types.ObjectId;
  approvedByDirectorId?: Types.ObjectId;
  /** When the cycle entered director approval (submit to DO). Director deadline counts from this, not manager review completion. */
  directorApprovalStartedAt?: Date;
  directorDecision?: "approved" | "rejected" | null;
  directorComments?: string;
  directorRejectedAt?: Date;
  salaryIncrement?: number;
  salaryIncrementType?: SalaryIncrementType;
  actionPlanId?: Types.ObjectId;
  checkIn30Id?: Types.ObjectId;
  checkIn60Id?: Types.ObjectId;
  completedAt?: Date;
  notifyDate75: Date;
  formAvailableDate85: Date;
  dueDate90: Date;
  scheduledNextCycleReferenceDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reviewCycleSchema = new Schema<ReviewCycleDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    cycleNumber: { type: Number, required: true },
    referenceDate: { type: Date, required: true },
    status: { type: String, enum: REVIEW_CYCLE_STATUSES, required: true },
    selfReviewToken: { type: String, default: undefined },
    selfReviewTokenExpiresAt: { type: Date, default: undefined },
    selfReviewId: { type: Schema.Types.ObjectId, ref: "SelfReview", default: undefined },
    managerReviewId: { type: Schema.Types.ObjectId, ref: "ManagerReview", default: undefined },
    reviewedByManagerId: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    approvedByDirectorId: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    directorApprovalStartedAt: { type: Date, default: undefined },
    directorDecision: { type: String, enum: ["approved", "rejected", null], default: null },
    directorComments: { type: String, default: undefined },
    directorRejectedAt: { type: Date, default: undefined },
    salaryIncrement: { type: Number, default: undefined },
    salaryIncrementType: {
      type: String,
      enum: ["percent", "fixed"],
      default: undefined,
    },
    actionPlanId: { type: Schema.Types.ObjectId, ref: "ActionPlan", default: undefined },
    checkIn30Id: { type: Schema.Types.ObjectId, ref: "CheckIn", default: undefined },
    checkIn60Id: { type: Schema.Types.ObjectId, ref: "CheckIn", default: undefined },
    completedAt: { type: Date, default: undefined },
    notifyDate75: { type: Date, required: true },
    formAvailableDate85: { type: Date, required: true },
    dueDate90: { type: Date, required: true },
    scheduledNextCycleReferenceDate: { type: Date, default: undefined },
  },
  { timestamps: true },
);

reviewCycleSchema.index({ employeeId: 1, cycleNumber: 1 }, { unique: true });
reviewCycleSchema.index({ scheduledNextCycleReferenceDate: 1, status: 1 }, { sparse: true });
reviewCycleSchema.index({ status: 1 });
reviewCycleSchema.index({ notifyDate75: 1 });
reviewCycleSchema.index({ formAvailableDate85: 1 });
reviewCycleSchema.index({ dueDate90: 1 });
reviewCycleSchema.index({ selfReviewToken: 1 }, { sparse: true });

export const ReviewCycleModel = mongoose.model<ReviewCycleDocument>(
  "ReviewCycle",
  reviewCycleSchema,
);

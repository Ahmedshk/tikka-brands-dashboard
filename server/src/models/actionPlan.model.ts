import mongoose, { Schema, Document, Types } from "mongoose";

export interface ActionPlanDocument extends Document {
  _id: Types.ObjectId;
  reviewCycleId: Types.ObjectId;
  employeeId: Types.ObjectId;
  createdByManagerId: Types.ObjectId;
  items: {
    period: "30" | "60" | "90";
    description: string;
    targetScore?: string;
    currentScore?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const actionPlanSchema = new Schema<ActionPlanDocument>(
  {
    reviewCycleId: { type: Schema.Types.ObjectId, ref: "ReviewCycle", required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByManagerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: {
      type: [
        {
          period: { type: String, enum: ["30", "60", "90"], required: true },
          description: { type: String, required: true },
          targetScore: { type: String, default: undefined },
          currentScore: { type: String, default: undefined },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

actionPlanSchema.index({ reviewCycleId: 1 }, { unique: true });

export const ActionPlanModel = mongoose.model<ActionPlanDocument>(
  "ActionPlan",
  actionPlanSchema,
);

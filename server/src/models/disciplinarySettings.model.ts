import mongoose, { Schema, Document, Types } from "mongoose";
import type {
  IDisciplinaryPolicy,
  IDisciplinaryPolicySection,
  IImmediateTerminationPolicy,
  IDisciplineGuideline,
} from "../types/disciplinary.types.js";

export interface DisciplinarySettingsDocument extends Document {
  _id: Types.ObjectId;
  rollingPeriodDays: number;
  pointsToTermination: number;
  policySections: IDisciplinaryPolicySection[];
  immediateTerminationPolicies: IImmediateTerminationPolicy[];
  disciplineGuidelines: IDisciplineGuideline[];
  isConfigured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const policySchema = new Schema<IDisciplinaryPolicy>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: false, default: "" },
    points: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const policySectionSchema = new Schema<IDisciplinaryPolicySection>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    order: { type: Number, required: true },
    policies: { type: [policySchema], default: [] },
  },
  { _id: false },
);

const immediateTerminationPolicySchema =
  new Schema<IImmediateTerminationPolicy>(
    {
      id: { type: String, required: true },
      title: { type: String, required: true },
      description: { type: String, required: false, default: "" },
    },
    { _id: false },
  );

const guidelineSchema = new Schema<IDisciplineGuideline>(
  {
    id: { type: String, required: true },
    pointThreshold: { type: Number, required: true, min: 0 },
    action: { type: String, required: true },
  },
  { _id: false },
);

const disciplinarySettingsSchema = new Schema<DisciplinarySettingsDocument>(
  {
    rollingPeriodDays: { type: Number, required: true, default: 90 },
    pointsToTermination: { type: Number, required: true, default: 15 },
    policySections: { type: [policySectionSchema], default: [] },
    immediateTerminationPolicies: {
      type: [immediateTerminationPolicySchema],
      default: [],
    },
    disciplineGuidelines: { type: [guidelineSchema], default: [] },
    isConfigured: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const DisciplinarySettingsModel =
  mongoose.model<DisciplinarySettingsDocument>(
    "DisciplinarySettings",
    disciplinarySettingsSchema,
  );

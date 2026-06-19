import mongoose, { Schema, Document, Types } from "mongoose";
import {
  SIGNING_STATUSES,
  type IAppliedPolicy,
  type IAppliedImmediateTerminationPolicy,
  type SigningStatus,
} from "../types/disciplinary.types.js";

export interface DisciplinaryIncidentDocument extends Document {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  reportedBy: Types.ObjectId;
  locationId: Types.ObjectId;

  appliedPolicies: IAppliedPolicy[];
  isImmediateTermination: boolean;
  immediateTerminationPolicies?: IAppliedImmediateTerminationPolicy[];
  immediateTerminationPolicy?: IAppliedImmediateTerminationPolicy;

  totalPoints: number;

  businessLegalName: string;

  detailsOfIncident: string;
  supervisorCommitment: string;
  supervisorComments: string;
  associateCommitment?: string;
  associateComments?: string;
  positiveResults?: string;
  negativeConsequences?: string;

  signingStatus: SigningStatus;
  adobeAgreementId?: string;
  managerSigningUrl?: string;
  managerSignedAt?: Date;
  employeeSignedAt?: Date;

  signedDocumentPublicId?: string;
  auditTrailPublicId?: string;

  incidentDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const appliedPolicySchema = new Schema<IAppliedPolicy>(
  {
    policyId: { type: String, required: true },
    sectionId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: false, default: "" },
    points: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const immediateTerminationPolicySchema =
  new Schema<IAppliedImmediateTerminationPolicy>(
    {
      id: { type: String, required: true },
      title: { type: String, required: true },
      description: { type: String, required: false, default: "" },
    },
    { _id: false },
  );

const disciplinaryIncidentSchema = new Schema<DisciplinaryIncidentDocument>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    appliedPolicies: { type: [appliedPolicySchema], default: [] },
    isImmediateTermination: { type: Boolean, default: false },
    immediateTerminationPolicies: {
      type: [immediateTerminationPolicySchema],
      default: [],
    },
    immediateTerminationPolicy: {
      type: immediateTerminationPolicySchema,
      default: undefined,
    },
    totalPoints: { type: Number, required: true, default: 0 },
    businessLegalName: { type: String, required: true, trim: true },
    detailsOfIncident: { type: String, required: true },
    supervisorCommitment: { type: String, required: true },
    supervisorComments: { type: String, required: true },
    associateCommitment: { type: String, default: undefined },
    associateComments: { type: String, default: undefined },
    positiveResults: { type: String, default: undefined },
    negativeConsequences: { type: String, default: undefined },
    signingStatus: {
      type: String,
      enum: SIGNING_STATUSES,
      default: "pending_manager",
    },
    adobeAgreementId: { type: String, default: undefined },
    managerSigningUrl: { type: String, default: undefined },
    managerSignedAt: { type: Date, default: undefined },
    employeeSignedAt: { type: Date, default: undefined },
    signedDocumentPublicId: { type: String, default: undefined },
    auditTrailPublicId: { type: String, default: undefined },
    incidentDate: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

disciplinaryIncidentSchema.index({ employeeId: 1, incidentDate: -1 });
disciplinaryIncidentSchema.index({ employeeId: 1, signingStatus: 1 });
disciplinaryIncidentSchema.index({ adobeAgreementId: 1 });

export const DisciplinaryIncidentModel =
  mongoose.model<DisciplinaryIncidentDocument>(
    "DisciplinaryIncident",
    disciplinaryIncidentSchema,
  );

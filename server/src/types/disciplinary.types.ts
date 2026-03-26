import type { Types } from "mongoose";

export const SIGNING_STATUSES = [
  "pending_manager",
  "pending_employee",
  "completed",
  "declined",
  "cancelled",
  "expired",
] as const;

export type SigningStatus = (typeof SIGNING_STATUSES)[number];

export interface IDisciplinaryPolicy {
  id: string;
  title: string;
  description: string;
  points: number;
}

export interface IDisciplinaryPolicySection {
  id: string;
  name: string;
  order: number;
  policies: IDisciplinaryPolicy[];
}

export interface IImmediateTerminationPolicy {
  id: string;
  title: string;
  description: string;
}

export interface IDisciplineGuideline {
  id: string;
  pointThreshold: number;
  action: string;
}

export interface IDisciplinarySettings {
  _id?: string;
  rollingPeriodDays: number;
  pointsToTermination: number;
  policySections: IDisciplinaryPolicySection[];
  immediateTerminationPolicies: IImmediateTerminationPolicy[];
  disciplineGuidelines: IDisciplineGuideline[];
  isConfigured: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAppliedPolicy {
  policyId: string;
  sectionId: string;
  title: string;
  description: string;
  points: number;
}

export interface IAppliedImmediateTerminationPolicy {
  id: string;
  title: string;
  description: string;
}

export interface IDisciplinaryIncident {
  _id?: string;
  employeeId: Types.ObjectId | string;
  reportedBy: Types.ObjectId | string;
  locationId: Types.ObjectId | string;

  appliedPolicies: IAppliedPolicy[];
  isImmediateTermination: boolean;
  immediateTerminationPolicy?: IAppliedImmediateTerminationPolicy;

  totalPoints: number;

  detailsOfIncident: string;
  supervisorCommitment: string;
  supervisorComments: string;
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
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DisciplinaryEmployeeListItem {
  id: string;
  name: string;
  role: string;
  activePoints: number;
  mostRecentIncidentDate: string | null;
  status: DisciplinaryStatus;
  eSignStatus: { type: "pending"; count: number } | { type: "compliant" };
  avatarUrl?: string;
}

export type DisciplinaryStatus =
  | "Good Standing"
  | "Caution"
  | "At Risk"
  | "Critical";

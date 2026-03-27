export type DisciplinaryStatus = 'Good Standing' | 'Caution' | 'At Risk' | 'Critical';

export type ESignStatus =
  | { type: 'pending'; count: number }
  | { type: 'compliant' };

export interface DisciplinaryRow {
  id?: string;
  name: string;
  role: string;
  points90Day: number;
  mostRecent: string; // MM-DD-YYYY
  status: DisciplinaryStatus;
  eSignStatus: ESignStatus;
}

// Details page types
export interface DisciplinaryDetailsEmployee {
  id: string;
  name: string;
  role: string;
  status: DisciplinaryStatus;
  points90Day: number;
  pointsThreshold: number;
  avatarUrl?: string;
}

export interface RequiredProtocol {
  currentAction: string;
  message?: string;
}

export type IncidentHistorySigningStatus =
  | 'pending'
  | 'signed'
  | 'declined'
  | 'cancelled'
  | 'expired';

export type IncidentSigningPhase =
  | 'pending_manager'
  | 'pending_employee'
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'expired';

export interface IncidentHistoryItem {
  id: string;
  incidentType: string;
  date: string;
  incidentDateIso: string;
  documentName: string;
  status: IncidentHistorySigningStatus;
  signingPhase: IncidentSigningPhase;
  assignerId?: string;
  assignerName: string;
  totalPoints: number;
  detailsOfIncident: string;
  supervisorCommitment: string;
  associateCommitment?: string;
  supervisorComments: string;
  associateComments?: string;
  positiveResults?: string;
  negativeConsequences?: string;
  managerSignedAt?: string;
  employeeSignedAt?: string;
  signedDocumentPublicId?: string;
  auditTrailPublicId?: string;
}

export interface DocumentVaultItem {
  fileName: string;
}

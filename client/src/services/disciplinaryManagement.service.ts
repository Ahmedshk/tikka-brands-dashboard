import api from "./api.service";
import type { LocationApiParams } from "../utils/locationSelectionHelpers";
import { resolveLocationQuery } from "../utils/locationSelectionHelpers";
import type {
  DisciplinaryRow,
  DisciplinaryStatus,
  ESignStatus,
} from "../types/disciplinaryManagement.types";

interface ApiEmployee {
  id: string;
  name: string;
  role: string;
  activePoints: number;
  mostRecentIncidentDate: string | null;
  status: DisciplinaryStatus;
  eSignStatus: ESignStatus;
  avatarUrl?: string;
}

interface EmployeeDetails {
  employee: {
    id: string;
    name: string;
    role: string;
    status: DisciplinaryStatus;
    activePoints: number;
    pointsThreshold: number;
    avatarUrl?: string;
  };
  protocol: { currentAction: string; message: string };
  incidents: Incident[];
  totalIncidents: number;
  documents: SignedDocument[];
  settings: {
    rollingPeriodDays: number;
    pointsToTermination: number;
    guidelines: { id: string; pointThreshold: number; action: string }[];
  };
}

interface Incident {
  _id: string;
  appliedPolicies: {
    policyId: string;
    sectionId: string;
    title: string;
    description: string;
    points: number;
  }[];
  isImmediateTermination: boolean;
  totalPoints: number;
  detailsOfIncident: string;
  supervisorCommitment: string;
  supervisorComments: string;
  associateCommitment?: string;
  associateComments?: string;
  positiveResults?: string;
  negativeConsequences?: string;
  signingStatus: string;
  managerSignedAt?: string;
  employeeSignedAt?: string;
  signedDocumentPublicId?: string;
  auditTrailPublicId?: string;
  incidentDate: string;
  createdAt: string;
  reportedBy?: { _id?: string; firstName: string; lastName: string };
}

interface SignedDocument {
  _id: string;
  signedDocumentPublicId: string;
  auditTrailPublicId?: string;
  incidentDate: string;
  totalPoints: number;
}

interface IncidentCreatePayload {
  employeeId: string;
  locationId: string;
  appliedPolicies: {
    policyId: string;
    sectionId: string;
    title: string;
    description: string;
    points: number;
  }[];
  isImmediateTermination: boolean;
  immediateTerminationPolicies?: Array<{
    id: string;
    title: string;
    description: string;
  }>;
  detailsOfIncident: string;
  supervisorCommitment: string;
  supervisorComments: string;
  associateCommitment?: string;
  associateComments?: string;
  positiveResults?: string;
  negativeConsequences?: string;
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const d = new Date(isoDate);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

export const disciplinaryManagementService = {
  async getEmployees(
    locationQuery: LocationApiParams | string,
    options: { page?: number; limit?: number; search?: string } = {},
    config?: { signal?: AbortSignal },
  ): Promise<{
    rows: DisciplinaryRow[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      criticalCount: number;
      pendingCount: number;
      totalActive: number;
    };
  }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 10;
    const search = options.search?.trim() ?? '';
    const params = new URLSearchParams({
      ...resolveLocationQuery(locationQuery),
      page: String(page),
      limit: String(limit),
    });
    if (search) {
      params.set('search', search);
    }
    const { data } = await api.get(`/disciplinary/employees?${params.toString()}`, {
      signal: config?.signal,
    });
    const employees: ApiEmployee[] = data.data;
    const rows = employees.map((e) => ({
      id: e.id,
      name: e.name,
      role: e.role,
      points90Day: e.activePoints,
      mostRecent: formatDate(e.mostRecentIncidentDate),
      status: e.status,
      eSignStatus: e.eSignStatus,
    }));
    return {
      rows,
      meta: data.meta,
    };
  },

  async getEmployeeDetails(employeeId: string): Promise<EmployeeDetails> {
    const { data } = await api.get(
      `/disciplinary/employees/${employeeId}`,
    );
    return data.data;
  },

  async getEmployeeIncidents(
    employeeId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    incidents: Incident[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { data } = await api.get(
      `/disciplinary/employees/${employeeId}/incidents?page=${page}&limit=${limit}`,
    );
    return { incidents: data.data, meta: data.meta };
  },

  async createIncident(payload: IncidentCreatePayload): Promise<Incident> {
    const { data } = await api.post("/disciplinary/incidents", payload);
    return data.data;
  },

  async sendForSignature(employeeId: string): Promise<{
    incidentId: string;
    adobeAgreementId: string;
    embeddedSignUrl: string;
  }> {
    const { data } = await api.post(
      `/disciplinary/employees/${employeeId}/send-for-signature`,
    );
    return data.data;
  },

  async getEmbeddedSignUrl(incidentId: string): Promise<{ embeddedSignUrl: string }> {
    const { data } = await api.get(
      `/disciplinary/incidents/${incidentId}/embedded-sign-url`,
    );
    return data.data;
  },
};

export type { EmployeeDetails, Incident, SignedDocument, IncidentCreatePayload };

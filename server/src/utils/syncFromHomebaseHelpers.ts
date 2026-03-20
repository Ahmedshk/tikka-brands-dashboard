import type { IUser, HomebaseJob } from "../types/user.types.js";
import type {
  HomebaseEmployee,
  HomebaseEmployeeJob,
} from "../services/homebase.service.js";

export interface NormalizedHomebaseEmployee {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | undefined;
  homebaseData: {
    id: string;
    job: HomebaseJob | undefined;
    created_at: Date | undefined;
    updated_at: Date | undefined;
  };
}

/** Copy job fields from API response excluding pin. */
function jobWithoutPin(job: HomebaseEmployeeJob | null | undefined): HomebaseJob | undefined {
  if (!job) return undefined;
  return {
    id: job.id,
    level: job.level ?? null,
    default_role: job.default_role ?? null,
    pos_partner_id: job.pos_partner_id ?? null,
    payroll_id: job.payroll_id ?? null,
    wage_rate: job.wage_rate ?? null,
    wage_type: job.wage_type ?? null,
    roles: Array.isArray(job.roles) ? job.roles : [],
    archived_at: job.archived_at ?? null,
    location_uuid: job.location_uuid ?? null,
  };
}

function parseDate(s: string | null | undefined): Date | undefined {
  if (s == null || typeof s !== "string" || !s.trim()) return undefined;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

/**
 * Normalize a Homebase employee into a plain record for user create/update.
 * Returns null if email is missing (employee should be skipped).
 */
export function normalizeHomebaseEmployee(
  emp: HomebaseEmployee,
): NormalizedHomebaseEmployee | null {
  const email = (emp.email ?? "").trim().toLowerCase();
  if (!email) return null;

  return {
    email,
    firstName: (emp.first_name ?? "").trim() || "Unknown",
    lastName: (emp.last_name ?? "").trim() || "Unknown",
    phone: emp.phone?.trim() || undefined,
    homebaseData: {
      id: String(emp.id),
      job: jobWithoutPin(emp.job),
      created_at: parseDate(emp.created_at),
      updated_at: parseDate(emp.updated_at),
    },
  };
}

/** Build Partial<IUser> for updateById from normalized Homebase employee and existing user. */
export function buildHomebaseSyncUpdatePayload(
  normalized: NormalizedHomebaseEmployee,
  _existing: UserDocumentLike,
): Partial<IUser> {
  const payload: Partial<IUser> = {
    firstName: normalized.firstName,
    lastName: normalized.lastName,
    homebaseData: {
      id: normalized.homebaseData.id,
      job: normalized.homebaseData.job ?? null,
      created_at: normalized.homebaseData.created_at ?? null,
      updated_at: normalized.homebaseData.updated_at ?? null,
    },
  };
  if (normalized.phone !== undefined && normalized.phone !== "") {
    payload.phone = normalized.phone;
  }
  const archivedAt = normalized.homebaseData.job?.archived_at;
  if (archivedAt != null && archivedAt !== "") {
    payload.isTerminated = true;
  }
  if (normalized.homebaseData.created_at != null) {
    payload.startDate = normalized.homebaseData.created_at;
  }
  return payload;
}

/** Build create payload for userRepository.create from normalized Homebase employee and hashed password. */
export function buildHomebaseSyncCreatePayload(
  normalized: NormalizedHomebaseEmployee,
  hashedPassword: string,
): Omit<IUser, "_id" | "createdAt" | "updatedAt"> {
  const archivedAt = normalized.homebaseData.job?.archived_at;
  const isTerminated = archivedAt != null && archivedAt !== "";
  return {
    email: normalized.email,
    password: hashedPassword,
    firstName: normalized.firstName,
    lastName: normalized.lastName,
    role: null,
    roleId: null,
    isActive: true,
    isTerminated,
    status: "pending",
    ...(normalized.phone && { phone: normalized.phone }),
    ...(normalized.homebaseData.created_at != null && { startDate: normalized.homebaseData.created_at }),
    homebaseData: {
      id: normalized.homebaseData.id,
      job: normalized.homebaseData.job ?? null,
      created_at: normalized.homebaseData.created_at ?? null,
      updated_at: normalized.homebaseData.updated_at ?? null,
    },
  };
}

interface UserDocumentLike {
  phone?: string;
}

import type { IUser } from "../types/user.types.js";

/** Minimal shape for a Square team member (avoids coupling utils to square.service). */
export interface SquareTeamMemberLike {
  id?: string;
  given_name?: string;
  family_name?: string;
  email_address?: string;
  phone_number?: string;
}

export interface NormalizedTeamMember {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | undefined;
  squareId: string | undefined;
}

/**
 * Normalize a Square team member into a plain record for user create/update.
 * Returns null if email is missing (member should be skipped).
 */
export function normalizeTeamMember(
  tm: SquareTeamMemberLike,
): NormalizedTeamMember | null {
  const email = (tm.email_address ?? "").trim().toLowerCase();
  if (!email) return null;
  return {
    email,
    firstName: (tm.given_name ?? "").trim() || "Unknown",
    lastName: (tm.family_name ?? "").trim() || "Unknown",
    phone: tm.phone_number?.trim() || undefined,
    squareId: tm.id?.trim() || undefined,
  };
}

/** Build Partial<IUser> for updateById from normalized data and existing user. */
export function buildSyncUpdatePayload(
  normalized: NormalizedTeamMember,
  existing: { phone?: string; squareId?: string },
): Partial<IUser> {
  const payload: Partial<IUser> = {
    firstName: normalized.firstName,
    lastName: normalized.lastName,
  };
  const phone = normalized.phone ?? existing.phone;
  const squareId = normalized.squareId ?? existing.squareId;
  if (phone !== undefined && phone !== "") payload.phone = phone;
  if (squareId !== undefined && squareId !== "") payload.squareId = squareId;
  return payload;
}

/** Build create payload for userRepository.create from normalized data and hashed password. */
export function buildSyncCreatePayload(
  normalized: NormalizedTeamMember,
  hashedPassword: string,
): Omit<IUser, "_id" | "createdAt" | "updatedAt"> {
  return {
    email: normalized.email,
    password: hashedPassword,
    firstName: normalized.firstName,
    lastName: normalized.lastName,
    role: null,
    roleId: null,
    isActive: true,
    status: "pending",
    ...(normalized.phone !== undefined &&
      normalized.phone !== "" && { phone: normalized.phone }),
    ...(normalized.squareId !== undefined &&
      normalized.squareId !== "" && { squareId: normalized.squareId }),
  };
}

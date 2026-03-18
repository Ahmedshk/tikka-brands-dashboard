import type { RolePermissions } from './rbac.types.js';

export enum UserRole {
  OWNER = 'Owner',
  DIRECTOR_OF_OPERATIONS = 'Director of Operations',
  DISTRICT_MANAGER = 'District Manager',
  GENERAL_MANAGER = 'General Manager',
  SHIFT_SUPERVISOR = 'Shift Supervisor',
  TEAM_MEMBER = 'Team Member',
}

export type UserStatus = 'pending' | 'active';

/** Homebase job object stored on user (all fields from API except pin). */
export interface HomebaseJob {
  id: number;
  level?: string | null;
  default_role?: string | null;
  pos_partner_id?: string | null;
  payroll_id?: string | null;
  wage_rate?: number | null;
  wage_type?: string | null;
  roles?: unknown[];
  archived_at?: string | null;
  location_uuid?: string | null;
}

/** All Homebase-sourced fields stored in one object to avoid clashing with existing user fields. */
export interface HomebaseData {
  id: string;
  job?: HomebaseJob | null;
  created_at?: Date | null;
  updated_at?: Date | null;
}

export interface IUser {
  _id?: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Role display name from Role document or legacy enum; null/empty = unassigned. */
  role: string | null;
  /** Reference to Role document; when set, permissions are resolved from Role. */
  roleId?: string | null;
  isActive: boolean;
  /** pending = invited, not yet logged in; active = has logged in at least once. */
  status?: UserStatus;
  /** Set when an invitation email has been sent (create+invite or resend). Used to show "Send" vs "Resend" invitation. */
  invitationSentAt?: Date;
  /** Single-use token for set-password link; cleared when password is set or on resend. */
  invitationToken?: string;
  invitationTokenExpiresAt?: Date;
  phone?: string;
  squareId?: string;
  /** Homebase employee data (id, job, created_at, updated_at). Used for sync and lookup. */
  homebaseData?: HomebaseData | null;
  /** Cloudinary public_id for profile image; never expose raw URL to client. */
  profileImagePublicId?: string | null;
  /** Additive permission overrides (extra pages/components on top of role). Only type 'custom' or null. */
  permissionOverrides?: RolePermissions | null;
  /** Additional location IDs the user can access on top of the role's locations. */
  locationOverrides?: string[] | null;
  /** Permission pages/components to remove from (role ∪ permissionOverrides) for this user. */
  permissionRemovals?: RolePermissions | null;
  /** Location IDs to remove from (role locations ∪ locationOverrides) for this user. */
  locationRemovals?: string[] | null;
  createdAt?: Date;
  updatedAt?: Date;
}

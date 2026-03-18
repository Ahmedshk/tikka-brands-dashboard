import type { RolePermissions } from './rbac.types';

/** Homebase job object (all fields from API except pin). */
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

/** All Homebase-sourced fields stored in one object. */
export interface HomebaseData {
  id: string;
  job?: HomebaseJob | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Display status: Pending (invited, not logged in), Active (logged in), Suspended (deactivated), Terminated (homebase archived). */
export type UserStatus = 'Pending' | 'Active' | 'Suspended' | 'Terminated';

export interface UserRow {
  _id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone?: string;
  squareId?: string;
  homebaseData?: HomebaseData | null;
  /** Role display name; empty/null = "Role unassigned". */
  role: string | null;
  roleId?: string | null;
  status: UserStatus;
  isActive: boolean;
  /** When set, an invitation email has been sent at least once (shows "Resend" vs "Send" invitation). */
  invitationSentAt?: string | null;
  /** Proxy URL for profile image (backend hides Cloudinary URL). */
  profileImageUrl?: string | null;
  /** Additive permission overrides (extra pages/components on top of role). */
  permissionOverrides?: RolePermissions | null;
  /** Additional location IDs the user can access on top of the role's locations. */
  locationOverrides?: string[] | null;
  /** Permission pages/components removed from (role ∪ overrides) for this user. */
  permissionRemovals?: RolePermissions | null;
  /** Location IDs removed from (role locations ∪ overrides) for this user. */
  locationRemovals?: string[] | null;
  createdAt?: string | null;
}

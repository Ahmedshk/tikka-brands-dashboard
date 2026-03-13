import type { RolePermissions } from './rbac.types';

/** Display status: Pending (invited, not logged in), Active (logged in), Suspended (deactivated). */
export type UserStatus = 'Pending' | 'Active' | 'Suspended';

export interface UserRow {
  _id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone?: string;
  squareId?: string;
  homebaseId?: string;
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
}

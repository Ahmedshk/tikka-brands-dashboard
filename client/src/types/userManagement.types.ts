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
}

export enum UserRole {
  OWNER = 'Owner',
  DIRECTOR_OF_OPERATIONS = 'Director of Operations',
  DISTRICT_MANAGER = 'District Manager',
  GENERAL_MANAGER = 'General Manager',
  SHIFT_SUPERVISOR = 'Shift Supervisor',
  TEAM_MEMBER = 'Team Member',
}

export type UserStatus = 'pending' | 'active';

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
  homebaseId?: string;
  /** Cloudinary public_id for profile image; never expose raw URL to client. */
  profileImagePublicId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export enum UserRole {
  OWNER = 'Owner',
  DIRECTOR_OF_OPERATIONS = 'Director of Operations',
  DISTRICT_MANAGER = 'District Manager',
  GENERAL_MANAGER = 'General Manager',
  SHIFT_SUPERVISOR = 'Shift Supervisor',
  TEAM_MEMBER = 'Team Member',
}

export interface IUser {
  _id?: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  /** Reference to Role document; when set, permissions are resolved from Role. */
  roleId?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export enum UserRole {
  OWNER = "Owner",
  DIRECTOR_OF_OPERATIONS = "Director of Operations",
  DISTRICT_MANAGER = "District Manager",
  GENERAL_MANAGER = "General Manager",
  SHIFT_SUPERVISOR = "Shift Supervisor",
  TEAM_MEMBER = "Team Member",
}

import type { RolePermissions } from './rbac.types';

export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  /** Resolved from Role; used for nav and route guards. */
  permissions?: RolePermissions;
  /** Resolved from Role.locations: 'all' or list of location IDs the user can access. */
  allowedLocationIds?: 'all' | string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Array<{
    path: string;
    message: string;
  }>;
}

export interface Logo {
  _id: string;
  dataUrl: string;
  contentType?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Location {
  _id: string;
  storeName: string;
  address: string;
  squareLocationId: string;
  homebaseLocationId: string;
  timezone: string;
  businessStartTime: string;
  /** True when location has a stored Square token (value never sent to client). */
  hasSquareAccessToken?: boolean;
  /** True when location has a stored Homebase API key (value never sent to client). */
  hasHomebaseApiKey?: boolean;
  /** Reference to logo document; when set, logoDataUrl is populated for display. */
  logoId?: string;
  /** Data URL for the location logo (populated by API when logoId is set). */
  logoDataUrl?: string;
  /** MarketMan Buyer GUID for this location. */
  marketManBuyerGuid?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Goal {
  _id?: string;
  locationId: string;
  salesGoal: number;
  laborCostGoal: number;
  hoursGoal: number;
  spmhGoal: number;
  foodCostGoal: number;
  createdAt?: string;
  updatedAt?: string;
}

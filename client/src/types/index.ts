export enum UserRole {
  OWNER = "Owner",
  DIRECTOR_OF_OPERATIONS = "Director of Operations",
  DISTRICT_MANAGER = "District Manager",
  GENERAL_MANAGER = "General Manager",
  SHIFT_SUPERVISOR = "Shift Supervisor",
  TEAM_MEMBER = "Team Member",
}

export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
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

export interface Location {
  _id: string;
  storeName: string;
  address: string;
  squareLocationId: string;
  homebaseLocationId: string;
  timezone: string;
  businessStartTime: string;
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

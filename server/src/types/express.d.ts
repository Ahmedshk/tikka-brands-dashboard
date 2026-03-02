import type { UserRole } from './user.types.js';
import type { RolePermissions } from './rbac.types.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: UserRole;
        permissions?: RolePermissions;
        /** User's additive overrides (used when role is 'all' to know which components were explicitly granted after removing full page). */
        permissionOverrides?: RolePermissions | null;
        /** Resolved from Role.locations: 'all' or list of location IDs the user can access. */
        allowedLocationIds?: 'all' | string[];
        /** Pages/components to deny even when permissions grant them. */
        permissionRemovals?: RolePermissions | null;
        /** Location IDs to deny even when allowedLocationIds grants them. */
        locationRemovals?: string[];
      };
    }
  }
}

export {};

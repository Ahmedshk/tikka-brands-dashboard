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
        /** Resolved from Role.locations: 'all' or list of location IDs the user can access. */
        allowedLocationIds?: 'all' | string[];
      };
    }
  }
}

export {};

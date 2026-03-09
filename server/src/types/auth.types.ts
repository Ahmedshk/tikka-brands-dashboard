import type { RolePermissions } from "./rbac.types.js";

/**
 * Payload encoded in JWT access/refresh tokens.
 */
export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  permissions?: RolePermissions;
}

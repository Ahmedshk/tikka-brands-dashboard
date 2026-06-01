import type { RoleRow } from '../types/rbac.types';

/** System Owner role display name matches server `SYSTEM_ROLE_NAME` / `UserRole.OWNER`. */
export function isOwnerRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toLowerCase() === 'owner';
}

/** Owner (system role) cannot be assigned when creating or editing users. */
export function filterRolesAssignableToUsers(roles: RoleRow[]): RoleRow[] {
  return roles.filter((r) => r.isSystem !== true);
}

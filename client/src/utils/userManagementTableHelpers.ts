/** System Owner role display name matches server `SYSTEM_ROLE_NAME` / `UserRole.OWNER`. */
export function isOwnerRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toLowerCase() === 'owner';
}

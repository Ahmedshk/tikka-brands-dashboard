import type { RolePermissions, PagePermission } from '../types/rbac.types.js';

/**
 * Returns effective page permission after applying removals, or null if the page is fully removed.
 * - Fully removed: removal entry for pageId with no components (empty or undefined).
 * - When permissions.type === 'all', base = permissionOverrides for this page if present, else allComponentIdsForPage; then subtract removal components.
 * - When type === 'custom', base = page's components (or allComponentIdsForPage if page has no components); then subtract removal components.
 */
export function getEffectivePagePermission(
  permissions: RolePermissions,
  permissionRemovals: RolePermissions | null | undefined,
  pageId: string,
  allComponentIdsForPage: string[],
  pageLabel?: string,
  permissionOverrides?: RolePermissions | null
): PagePermission | null {
  const removalPages = permissionRemovals?.type === 'custom' ? permissionRemovals.pages ?? [] : [];
  const removalEntry = removalPages.find((p) => p.pageId === pageId);
  if (removalEntry != null && (removalEntry.components == null || removalEntry.components.length === 0)) {
    return null;
  }
  const toRemove = new Set(removalEntry?.components ?? []);

  let baseComponents: string[];
  let label = pageLabel ?? removalEntry?.pageLabel ?? pageId;

  if (permissions.type === 'all') {
    const overridePage = permissionOverrides?.type === 'custom'
      ? permissionOverrides.pages?.find((p) => p.pageId === pageId)
      : undefined;
    baseComponents = (overridePage?.components?.length ? [...overridePage.components] : [...allComponentIdsForPage]);
    if (overridePage?.pageLabel) label = overridePage.pageLabel;
  } else {
    const page = permissions.pages?.find((p) => p.pageId === pageId);
    if (!page) return null;
    if (page.components == null || page.components.length === 0) {
      baseComponents = [...allComponentIdsForPage];
    } else {
      baseComponents = [...page.components];
    }
    if (page.pageLabel) label = page.pageLabel;
  }

  const effective = baseComponents.filter((c) => !toRemove.has(c));
  return { pageId, pageLabel: label, components: effective };
}

function toPageEntry(
  pageId: string,
  pageLabel: string,
  components: string[] | undefined
): PagePermission {
  const comps = components?.length ? [...components] : undefined;
  return {
    pageId,
    pageLabel,
    ...(comps == null ? {} : { components: comps }),
  };
}

function seedMapFromRolePages(
  pageMap: Map<string, PagePermission>,
  rolePages: PagePermission[]
): void {
  for (const p of rolePages) {
    pageMap.set(p.pageId, toPageEntry(p.pageId, p.pageLabel, p.components));
  }
}

function applyOverridePage(
  pageMap: Map<string, PagePermission>,
  ov: PagePermission
): void {
  const existing = pageMap.get(ov.pageId);
  if (!existing) {
    pageMap.set(ov.pageId, toPageEntry(ov.pageId, ov.pageLabel, ov.components));
    return;
  }
  const existingIds = new Set(existing.components ?? []);
  for (const c of ov.components ?? []) {
    existingIds.add(c);
  }
  existing.components = Array.from(existingIds);
}

/**
 * Merges role permissions with optional user permission overrides (additive only).
 * If role is type 'all', returns role as-is. If role is type 'custom', unions
 * role pages with override pages and merges component IDs per page.
 */
export function mergeRolePermissionsWithOverrides(
  rolePermissions: RolePermissions,
  overrides?: RolePermissions | null
): RolePermissions {
  if (rolePermissions.type === 'all') return rolePermissions;

  const overridePages =
    overrides?.type === 'custom' ? overrides.pages ?? [] : [];
  if (overridePages.length === 0) return rolePermissions;

  const rolePages = rolePermissions.pages ?? [];
  const pageMap = new Map<string, PagePermission>();
  seedMapFromRolePages(pageMap, rolePages);
  for (const ov of overridePages) {
    applyOverridePage(pageMap, ov);
  }

  return { type: 'custom', pages: Array.from(pageMap.values()) };
}

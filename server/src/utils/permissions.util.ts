import type { RolePermissions, PagePermission } from '../types/rbac.types.js';

type RemovalSubtractResult =
  | { kind: 'page_removed' }
  | { kind: 'ok'; toRemove: Set<string>; fallbackLabel?: string };

function removalSubtractResultForPage(
  permissionRemovals: RolePermissions | null | undefined,
  pageId: string,
): RemovalSubtractResult {
  const removalPages =
    permissionRemovals?.type === 'custom' ? permissionRemovals.pages ?? [] : [];
  const removalEntry = removalPages.find((p) => p.pageId === pageId);
  if (
    removalEntry != null &&
    (removalEntry.components == null || removalEntry.components.length === 0)
  ) {
    return { kind: 'page_removed' };
  }
  const toRemove = new Set(removalEntry?.components ?? []);
  const pageLabelFromRemoval = removalEntry?.pageLabel;
  return {
    kind: 'ok',
    toRemove,
    ...(pageLabelFromRemoval == null ? {} : { fallbackLabel: pageLabelFromRemoval }),
  };
}

function resolveBaseForAllPermissions(
  permissionOverrides: RolePermissions | null | undefined,
  pageId: string,
  allComponentIdsForPage: string[],
  pageLabel: string | undefined,
  fallbackLabelFromRemoval: string | undefined,
): { baseComponents: string[]; label: string } {
  let label = pageLabel ?? fallbackLabelFromRemoval ?? pageId;
  const overridePage =
    permissionOverrides?.type === 'custom'
      ? permissionOverrides.pages?.find((p) => p.pageId === pageId)
      : undefined;
  const baseComponents =
    overridePage?.components?.length != null && overridePage.components.length > 0
      ? [...overridePage.components]
      : [...allComponentIdsForPage];
  if (overridePage?.pageLabel) label = overridePage.pageLabel;
  return { baseComponents, label };
}

function resolveBaseForCustomPermissions(
  permissions: Extract<RolePermissions, { type: 'custom' }>,
  pageId: string,
  allComponentIdsForPage: string[],
  pageLabel: string | undefined,
  fallbackLabelFromRemoval: string | undefined,
): { baseComponents: string[]; label: string } | null {
  let label = pageLabel ?? fallbackLabelFromRemoval ?? pageId;
  const page = permissions.pages?.find((p) => p.pageId === pageId);
  if (!page) return null;
  const baseComponents =
    page.components == null || page.components.length === 0
      ? [...allComponentIdsForPage]
      : [...page.components];
  if (page.pageLabel) label = page.pageLabel;
  return { baseComponents, label };
}

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
  const removal = removalSubtractResultForPage(permissionRemovals, pageId);
  if (removal.kind === 'page_removed') return null;

  const base =
    permissions.type === 'all'
      ? resolveBaseForAllPermissions(
          permissionOverrides,
          pageId,
          allComponentIdsForPage,
          pageLabel,
          removal.fallbackLabel,
        )
      : resolveBaseForCustomPermissions(
          permissions,
          pageId,
          allComponentIdsForPage,
          pageLabel,
          removal.fallbackLabel,
        );

  if (!base) return null;

  const effective = base.baseComponents.filter((c) => !removal.toRemove.has(c));
  return { pageId, pageLabel: base.label, components: effective };
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

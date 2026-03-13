import type { RoleLocations, RoleLocationsResponse, PagePermission, RolePermissions } from '../types/rbac.types';
import { getComponentIdsForPage } from '../config/permissions.config';

export const FULL_PAGE_COMPONENT_ID = 'full-page';
export const RBAC_PAGE_ID = 'rbac-management';

/** Normalize API locations (possibly populated) to form state: 'all' | string[]. */
export function normalizeLocationsToIds(locations: RoleLocationsResponse | undefined): RoleLocations {
  if (locations == null || locations === 'all') return 'all';
  if (!Array.isArray(locations)) return 'all';
  if (locations.length === 0) return [];
  return locations.map((loc) =>
    typeof loc === 'object' && loc != null && '_id' in loc ? (loc as { _id: string })._id : String(loc)
  );
}

export function hasPageInCustom(pages: PagePermission[], pageId: string): boolean {
  return pages.some((p) => p.pageId === pageId);
}

export function getPageEntry(pages: PagePermission[], pageId: string): PagePermission | undefined {
  return pages.find((p) => p.pageId === pageId);
}

export function hasComponentAccess(
  pages: PagePermission[],
  pageId: string,
  componentId: string
): boolean {
  const entry = getPageEntry(pages, pageId);
  if (!entry) return false;
  if (entry.components == null) return true;
  if (entry.components.length === 0) return false;
  if (entry.components.includes(FULL_PAGE_COMPONENT_ID)) return true;
  return entry.components.includes(componentId);
}

export function allComponentsSelectedForPage(
  pages: PagePermission[],
  pageId: string
): boolean {
  const entry = getPageEntry(pages, pageId);
  if (!entry) return false;
  const allIds = getComponentIdsForPage(pageId);
  if (allIds.length === 0) return true;
  if (entry.components == null) return true;
  if (entry.components.length === 0) return false;
  if (entry.components.includes(FULL_PAGE_COMPONENT_ID)) return true;
  return allIds.every((id) => entry.components!.includes(id));
}

export function getPermissionsModeFromPermissions(perms: { type: string; pages?: PagePermission[] }): 'all' | 'none' | 'custom' {
  if (perms.type === 'all') return 'all';
  if (perms.type === 'custom' && (perms.pages?.length ?? 0) > 0) return 'custom';
  return 'none';
}

export interface AddEditRoleFormSetters {
  setName: (v: string) => void;
  setDescription: (v: string) => void;
  setPermissions: (v: RolePermissions) => void;
  setPermissionsMode: (v: 'all' | 'none' | 'custom') => void;
  setLocationsMode: (v: 'all' | 'none' | 'specific') => void;
  setLocations: (v: RoleLocations) => void;
  setNameTouched: (v: boolean) => void;
  setReportsTo: (v: string | null) => void;
}

/** Sync form state from initialRole; call when open/initialRole/isDuplicate change. */
export function applyInitialFormState(
  initialRole: { roleName: string; description?: string; permissions: RolePermissions; locations?: RoleLocationsResponse; reportsTo?: string | null } | null,
  isDuplicate: boolean,
  setters: AddEditRoleFormSetters
): void {
  if (initialRole == null) {
    setters.setName('');
    setters.setDescription('');
    setters.setPermissions({ type: 'all' });
    setters.setPermissionsMode('all');
    setters.setLocationsMode('all');
    setters.setLocations('all');
    setters.setReportsTo(null);
    return;
  }
  setters.setName(isDuplicate ? `Copy of ${initialRole.roleName}` : initialRole.roleName);
  setters.setDescription(initialRole.description ?? '');
  setters.setPermissions(initialRole.permissions);
  setters.setPermissionsMode(getPermissionsModeFromPermissions(initialRole.permissions));
  setters.setReportsTo(isDuplicate ? null : initialRole.reportsTo ?? null);
  const locs = normalizeLocationsToIds(initialRole.locations);
  if (locs === 'all') {
    setters.setLocationsMode('all');
    setters.setLocations('all');
  } else if (Array.isArray(locs) && locs.length === 0) {
    setters.setLocationsMode('none');
    setters.setLocations([]);
  } else {
    setters.setLocationsMode('specific');
    setters.setLocations(locs);
  }
  setters.setNameTouched(false);
}

function pushFullPageSelected(rest: PagePermission[], pageId: string, pageLabel: string): void {
  rest.push({ pageId, pageLabel, components: [FULL_PAGE_COMPONENT_ID] });
}

function pushFullPageDeselected(rest: PagePermission[], pageId: string, pageLabel: string): void {
  rest.push({ pageId, pageLabel, components: [] });
}

function buildNewEntryForComponentSelect(
  entry: PagePermission | undefined,
  componentId: string,
  pageId: string,
  pageLabel: string,
  allIds: string[]
): PagePermission {
  if (!entry) {
    return { pageId, pageLabel, components: [componentId] };
  }
  const comps = entry.components ?? [];
  const next = comps.includes(componentId) ? comps : [...comps, componentId];
  return {
    pageId,
    pageLabel,
    components: next.length === allIds.length ? undefined : next,
  };
}

function applyComponentDeselect(
  rest: PagePermission[],
  entry: PagePermission | undefined,
  componentId: string,
  pageId: string,
  pageLabel: string,
  allIds: string[]
): void {
  if (entry == null) return;
  const comps = entry.components ?? allIds;
  const next = comps.filter((c) => c !== componentId);
  rest.push({ pageId, pageLabel, components: next });
}

/** Compute next permissions when toggling a single page component. Returns unchanged permissions if not custom. */
export function computeNextPermissionsAfterPageComponentChange(
  permissions: RolePermissions,
  pageId: string,
  pageLabel: string,
  componentId: string,
  selected: boolean
): RolePermissions {
  if (permissions.type !== 'custom') return permissions;
  const allIds = getComponentIdsForPage(pageId);
  let entry = getPageEntry(permissions.pages, pageId);
  const rest = permissions.pages.filter((p) => p.pageId !== pageId);

  if (componentId === FULL_PAGE_COMPONENT_ID) {
    if (selected) {
      pushFullPageSelected(rest, pageId, pageLabel);
    } else {
      pushFullPageDeselected(rest, pageId, pageLabel);
    }
    return { type: 'custom', pages: rest };
  }

  if (selected) {
    entry = buildNewEntryForComponentSelect(entry, componentId, pageId, pageLabel, allIds);
    rest.push(entry);
  } else {
    applyComponentDeselect(rest, entry, componentId, pageId, pageLabel, allIds);
  }
  return { type: 'custom', pages: rest };
}

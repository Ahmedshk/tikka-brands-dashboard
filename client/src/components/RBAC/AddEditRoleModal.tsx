import { useState, useEffect } from 'react';
import type { RoleRow, RolePermissions, RoleLocations, RoleLocationsResponse, PagePermission } from '../../types/rbac.types';
import {
  PERMISSION_PAGES,
  getComponentIdsForPage,
} from '../../config/permissions.config';

const FULL_PAGE_COMPONENT_ID = 'full-page';

/** Normalize API locations (possibly populated) to form state: 'all' | string[]. */
function normalizeLocationsToIds(locations: RoleLocationsResponse | undefined): RoleLocations {
  if (locations == null || locations === 'all') return 'all';
  if (!Array.isArray(locations)) return 'all';
  if (locations.length === 0) return [];
  return locations.map((loc) =>
    typeof loc === 'object' && loc != null && '_id' in loc ? (loc as { _id: string })._id : String(loc)
  );
}

import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import { roleService } from '../../services/role.service';
import { locationService } from '../../services/location.service';
import type { Location } from '../../types';

export interface AddEditRoleModalProps {
  open: boolean;
  onClose: () => void;
  /** null = Add, set = Edit or Duplicate (name prefilled as "Copy of X" for duplicate) */
  initialRole: RoleRow | null;
  /** True when opening for Duplicate (same as initialRole but name is "Copy of ...") */
  isDuplicate?: boolean;
  onSaved: (role: RoleRow) => void;
  onError?: (message: string) => void;
}

function hasPageInCustom(pages: PagePermission[], pageId: string): boolean {
  return pages.some((p) => p.pageId === pageId);
}

function getPageEntry(pages: PagePermission[], pageId: string): PagePermission | undefined {
  return pages.find((p) => p.pageId === pageId);
}

function hasComponentAccess(
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

function allComponentsSelectedForPage(
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

const RBAC_PAGE_ID = 'rbac-management';

export function AddEditRoleModal({
  open,
  onClose,
  initialRole,
  isDuplicate = false,
  onSaved,
  onError,
}: AddEditRoleModalProps) {
  const user = useSelector((state: RootState) => state.auth.user);
  const currentUserRoleName = user?.role ?? null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<RolePermissions>({ type: 'all' });
  /** 'all' | 'none' | 'specific' – distinguishes None from Specific with zero selected */
  const [locationsMode, setLocationsMode] = useState<'all' | 'none' | 'specific'>('all');
  const [locations, setLocations] = useState<RoleLocations>('all');
  /** 'all' | 'none' | 'custom' – distinguishes None from Custom with no pages selected */
  const [permissionsMode, setPermissionsModeState] = useState<'all' | 'none' | 'custom'>('all');
  const [locationsList, setLocationsList] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  const isEdit = initialRole != null && !isDuplicate;
  const isEditingOwnRole =
    isEdit &&
    currentUserRoleName != null &&
    initialRole?.roleName === currentUserRoleName;

  const customPages =
    permissions.type === 'custom' ? permissions.pages : [];

  const wouldRemoveRbacAccess = (): boolean => {
    if (permissions.type === 'all') return false;
    const hasRbac = hasPageInCustom(customPages, RBAC_PAGE_ID);
    return !hasRbac;
  };

  const selfLockoutBlock =
    isEditingOwnRole && wouldRemoveRbacAccess();

  useEffect(() => {
    if (!open) return;
    if (initialRole == null) {
      setName('');
      setDescription('');
      setPermissions({ type: 'all' });
      setPermissionsModeState('all');
      setLocationsMode('all');
      setLocations('all');
    } else {
      setName(
        isDuplicate ? `Copy of ${initialRole.roleName}` : initialRole.roleName
      );
      setDescription(initialRole.description ?? '');
      setPermissions(initialRole.permissions);
      const perms = initialRole.permissions;
      setPermissionsModeState(
        perms.type === 'all' ? 'all' : perms.type === 'custom' && perms.pages.length > 0 ? 'custom' : 'none'
      );
      const locs = normalizeLocationsToIds(initialRole.locations);
      if (locs === 'all') {
        setLocationsMode('all');
        setLocations('all');
      } else if (Array.isArray(locs) && locs.length === 0) {
        setLocationsMode('none');
        setLocations([]);
      } else {
        setLocationsMode('specific');
        setLocations(locs);
      }
    }
    setNameTouched(false);
  }, [open, initialRole, isDuplicate]);

  useEffect(() => {
    if (!open) return;
    setLocationsLoading(true);
    locationService
      .getAll()
      .then(setLocationsList)
      .catch(() => setLocationsList([]))
      .finally(() => setLocationsLoading(false));
  }, [open]);

  const setPermissionsMode = (mode: 'all' | 'none' | 'custom') => {
    setPermissionsModeState(mode);
    if (mode === 'all') setPermissions({ type: 'all' });
    else setPermissions({ type: 'custom', pages: mode === 'none' ? [] : permissions.type === 'custom' ? permissions.pages : [] });
  };

  const setPageSelectAll = (pageId: string, pageLabel: string, selected: boolean) => {
    if (permissions.type !== 'custom') return;
    const rest = permissions.pages.filter((p) => p.pageId !== pageId);
    if (selected) {
      rest.push({ pageId, pageLabel, components: [] });
    }
    setPermissions({ type: 'custom', pages: rest });
  };

  const setPageComponent = (
    pageId: string,
    pageLabel: string,
    componentId: string,
    selected: boolean
  ) => {
    if (permissions.type !== 'custom') return;
    const allIds = getComponentIdsForPage(pageId);
    let entry = getPageEntry(permissions.pages, pageId);
    const rest = permissions.pages.filter((p) => p.pageId !== pageId);

    if (componentId === FULL_PAGE_COMPONENT_ID) {
      if (selected) {
        rest.push({ pageId, pageLabel, components: undefined });
      } else {
        rest.push({ pageId, pageLabel, components: [] });
      }
      setPermissions({ type: 'custom', pages: rest });
      return;
    }

    if (selected) {
      if (!entry) {
        entry = { pageId, pageLabel, components: [componentId] };
      } else {
        const comps = entry.components ?? [];
        const next =
          comps.includes(componentId) ? comps : [...comps, componentId];
        entry = {
          pageId,
          pageLabel,
          components: next.length === allIds.length ? undefined : next,
        };
      }
      rest.push(entry);
    } else {
      if (entry) {
        const comps = entry.components ?? allIds;
        const next = comps.filter((c) => c !== componentId);
        if (next.length > 0) {
          rest.push({ pageId, pageLabel, components: next });
        }
      }
    }
    setPermissions({ type: 'custom', pages: rest });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameTouched(true);
      return;
    }
    if (selfLockoutBlock) {
      onError?.(
        'You cannot remove your own access to RBAC Management. Ensure another Owner exists first, or leave RBAC Management access enabled.'
      );
      return;
    }
    if (locationsMode === 'specific' && (!Array.isArray(locations) || locations.length === 0)) {
      onError?.('Select at least one location or choose All locations or None.');
      return;
    }
    setSaving(true);
    try {
      const payloadLocations: RoleLocations =
        locationsMode === 'all' ? 'all' : locationsMode === 'none' ? [] : locations;
      const payload = {
        name: trimmedName,
        description: description.trim() || undefined,
        permissions,
        locations: payloadLocations,
      };
      if (isEdit && initialRole?.id) {
        const updated = await roleService.update(initialRole.id, payload);
        onSaved(updated);
      } else {
        const created = await roleService.create(payload);
        onSaved(created);
      }
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Something went wrong';
      onError?.(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-edit-role-title"
    >
      <div className="bg-card-background rounded-xl shadow-lg border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 id="add-edit-role-title" className="text-lg font-semibold text-primary">
            {isEdit ? 'Edit Role' : 'Add Role'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
            <div>
              <label htmlFor="role-name" className="block text-sm font-medium text-primary mb-1">
                Role name <span className="text-negative">*</span>
              </label>
              <input
                id="role-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setNameTouched(true)}
                disabled={isEdit && initialRole?.isSystem}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-primary disabled:opacity-60"
                placeholder="e.g. Store Manager"
              />
              {nameTouched && !name.trim() && (
                <p className="mt-1 text-xs text-negative">Role name is required.</p>
              )}
            </div>

            <div>
              <label htmlFor="role-description" className="block text-sm font-medium text-primary mb-1">
                Description (optional)
              </label>
              <textarea
                id="role-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-primary"
                placeholder="Describe what this role is for"
              />
            </div>

            <div className="pt-2 border-t border-gray-200">
              <h3 className="text-sm font-medium text-primary mb-2">Locations</h3>
              <p className="text-xs text-secondary mb-2">
                This role can access none, all locations, or only selected ones. Users with this role will only see and use the selected location(s) in the navbar.
              </p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-primary">
                  <input
                    type="radio"
                    name="locations-mode"
                    checked={locationsMode === 'none'}
                    onChange={() => {
                      setLocationsMode('none');
                      setLocations([]);
                    }}
                    className="rounded-full border-gray-300"
                  />
                  None
                </label>
                <label className="flex items-center gap-2 text-sm text-primary">
                  <input
                    type="radio"
                    name="locations-mode"
                    checked={locationsMode === 'all'}
                    onChange={() => {
                      setLocationsMode('all');
                      setLocations('all');
                    }}
                    className="rounded-full border-gray-300"
                  />
                  All locations
                </label>
                <label className="flex items-center gap-2 text-sm text-primary">
                  <input
                    type="radio"
                    name="locations-mode"
                    checked={locationsMode === 'specific'}
                    onChange={() => {
                      setLocationsMode('specific');
                      setLocations(Array.isArray(locations) ? locations : []);
                    }}
                    className="rounded-full border-gray-300"
                  />
                  Specific locations
                </label>
                {locationsMode === 'specific' && (
                  <div className="pl-6 mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white">
                    {locationsLoading ? (
                      <p className="text-xs text-secondary">Loading locations…</p>
                    ) : locationsList.length === 0 ? (
                      <p className="text-xs text-secondary">No locations available.</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {locationsList.map((loc) => {
                          const ids = Array.isArray(locations) ? locations : [];
                          const checked = ids.includes(loc._id);
                          return (
                            <label
                              key={loc._id}
                              className="flex items-center gap-2 text-sm text-secondary cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setLocations([...ids, loc._id]);
                                  } else {
                                    setLocations(ids.filter((id) => id !== loc._id));
                                  }
                                }}
                                className="rounded border-gray-300"
                              />
                              <span className="truncate">{loc.storeName}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-gray-200">
              <h3 className="text-sm font-medium text-primary mb-2">Pages and Components</h3>
              <p className="text-xs text-secondary mb-3">
                Choose which pages and components this role can access: none, all, or pick specific pages and components.
              </p>
              <div className="flex flex-col gap-2 mb-3">
                <label className="flex items-center gap-2 text-sm text-primary">
                  <input
                    type="radio"
                    name="permissions-mode"
                    checked={permissionsMode === 'none'}
                    onChange={() => setPermissionsMode('none')}
                    className="rounded-full border-gray-300"
                  />
                  None (no page access)
                </label>
                <label className="flex items-center gap-2 text-sm text-primary">
                  <input
                    type="radio"
                    name="permissions-mode"
                    checked={permissions.type === 'all'}
                    onChange={() => setPermissionsMode('all')}
                    className="rounded-full border-gray-300"
                  />
                  All (full access to all pages and components)
                </label>
                <label className="flex items-center gap-2 text-sm text-primary">
                  <input
                    type="radio"
                    name="permissions-mode"
                    checked={permissionsMode === 'custom'}
                    onChange={() => setPermissionsMode('custom')}
                    className="rounded-full border-gray-300"
                  />
                  Custom (select pages and components)
                </label>
              </div>

              {permissionsMode === 'custom' && (
                <div className="space-y-4 pl-6 border-l-2 border-gray-200">
                  {PERMISSION_PAGES.map((page) => {
                    const pageChecked = hasPageInCustom(customPages, page.pageId);
                    const fullPageChecked = pageChecked && (
                      (() => {
                        const entry = getPageEntry(customPages, page.pageId);
                        return entry?.components == null || entry?.components?.includes(FULL_PAGE_COMPONENT_ID);
                      })()
                    );
                    return (
                      <div key={page.pageId} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pageChecked}
                            onChange={(e) =>
                              setPageSelectAll(
                                page.pageId,
                                page.pageLabel,
                                e.target.checked
                              )
                            }
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm font-medium text-primary">
                            {page.pageLabel}
                          </span>
                        </div>
                        {pageChecked && (
                          <div className="pl-6 flex flex-wrap gap-x-4 gap-y-1">
                            {page.components.map((comp) => {
                              const isFullPage = comp.id === FULL_PAGE_COMPONENT_ID;
                              const checked = hasComponentAccess(
                                customPages,
                                page.pageId,
                                comp.id
                              );
                              const disabled = !isFullPage && fullPageChecked;
                              return (
                                <label
                                  key={comp.id}
                                  className={`flex items-center gap-1.5 text-sm text-secondary ${disabled ? 'opacity-90' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={(e) =>
                                      setPageComponent(
                                        page.pageId,
                                        page.pageLabel,
                                        comp.id,
                                        e.target.checked
                                      )
                                    }
                                    className="rounded border-gray-300 disabled:opacity-70"
                                  />
                                  {comp.label}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selfLockoutBlock && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                You are editing your own role. Saving would remove your access to RBAC
                Management. Either keep RBAC Management selected above or ensure another
                Owner exists before saving.
              </div>
            )}

            {/* Notifications placeholder per plan */}
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-secondary">
                Notifications and alerts can be assigned to this role in a future update.
              </p>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-primary hover:bg-gray-50"
              title="Cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || selfLockoutBlock || !name.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:opacity-90 disabled:opacity-50"
              title={isEdit ? 'Save changes' : 'Create role'}
            >
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

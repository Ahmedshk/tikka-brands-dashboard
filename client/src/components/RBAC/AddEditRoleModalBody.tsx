import type { RoleRow, RolePermissions, RoleLocations } from '../../types/rbac.types';
import { PERMISSION_PAGES } from '../../config/permissions.config';
import type { LocationListItem } from '../../types';
import {
  FULL_PAGE_COMPONENT_ID,
  hasPageInCustom,
  getPageEntry,
  hasComponentAccess,
  computeNextPermissionsAfterPageComponentChange,
} from '../../utils/addEditRoleModalHelpers';

export interface AddEditRoleModalBodyProps {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  permissions: RolePermissions;
  setPermissions: (v: RolePermissions) => void;
  permissionsMode: 'all' | 'none' | 'custom';
  handlePermissionsModeChange: (mode: 'all' | 'none' | 'custom') => void;
  locationsMode: 'all' | 'none' | 'specific';
  setLocationsMode: (v: 'all' | 'none' | 'specific') => void;
  locations: RoleLocations;
  setLocations: (v: RoleLocations) => void;
  locationsList: LocationListItem[];
  locationsLoading: boolean;
  nameTouched: boolean;
  setNameTouched: (v: boolean) => void;
  isEdit: boolean;
  initialRole: RoleRow | null;
  selfLockoutBlock: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  reportsTo: string | null;
  setReportsTo: (v: string | null) => void;
  availableRoles: Array<{ id: string; name: string }>;
}

function setPageSelectAll(
  permissions: RolePermissions,
  setPermissions: (v: RolePermissions) => void,
  pageId: string,
  pageLabel: string,
  selected: boolean
) {
  if (permissions.type !== 'custom') return;
  const rest = permissions.pages.filter((p) => p.pageId !== pageId);
  if (selected) {
    rest.push({ pageId, pageLabel, components: [] });
  }
  setPermissions({ type: 'custom', pages: rest });
}

function setPageComponent(
  permissions: RolePermissions,
  setPermissions: (v: RolePermissions) => void,
  pageId: string,
  pageLabel: string,
  componentId: string,
  selected: boolean
) {
  const next = computeNextPermissionsAfterPageComponentChange(
    permissions,
    pageId,
    pageLabel,
    componentId,
    selected
  );
  setPermissions(next);
}

export function AddEditRoleModalBody(props: Readonly<AddEditRoleModalBodyProps>) {
  const {
    name,
    setName,
    description,
    setDescription,
    permissions,
    setPermissions,
    permissionsMode,
    handlePermissionsModeChange,
    locationsMode,
    setLocationsMode,
    locations,
    setLocations,
    locationsList,
    locationsLoading,
    nameTouched,
    setNameTouched,
    isEdit,
    initialRole,
    selfLockoutBlock,
    saving,
    onClose,
    onSubmit,
    reportsTo: _reportsTo,
    setReportsTo: _setReportsTo,
    availableRoles: _availableRoles,
  } = props;

  const customPages = permissions.type === 'custom' ? permissions.pages : [];

  let locationsSpecificContent: React.ReactNode;
  if (locationsLoading) {
    locationsSpecificContent = <p className="text-xs text-secondary">Loading locations…</p>;
  } else if (locationsList.length === 0) {
    locationsSpecificContent = <p className="text-xs text-secondary">No locations available.</p>;
  } else {
    locationsSpecificContent = (
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
    );
  }

  let submitButtonLabel: string;
  if (saving) {
    submitButtonLabel = 'Saving…';
  } else if (isEdit) {
    submitButtonLabel = 'Save';
  } else {
    submitButtonLabel = 'Create';
  }

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
            disabled={isEdit && (initialRole?.isSystem === true)}
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

        {/* Reports To -- commented out; hierarchy is managed from Manage Hierarchy page.
        {!(isEdit && initialRole?.isSystem === true) && (
          <div className="pt-2 border-t border-gray-200">
            <h3 className="text-sm font-medium text-primary mb-2">Reports To</h3>
            <p className="text-xs text-secondary mb-2">
              Select the role this role reports to in the hierarchy. Leave as "None" for a top-level role.
            </p>
            <select
              value={reportsTo ?? ''}
              onChange={(e) => setReportsTo(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-primary text-sm bg-white"
            >
              <option value="">None (Top-level)</option>
              {availableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
        */}

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
              <span>None</span>
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
              <span>All locations</span>
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
              <span>Specific locations</span>
            </label>
            {locationsMode === 'specific' && (
              <div className="pl-6 mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white">
                {locationsSpecificContent}
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
                onChange={() => handlePermissionsModeChange('none')}
                className="rounded-full border-gray-300"
              />
              <span>None (no page access)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-primary">
              <input
                type="radio"
                name="permissions-mode"
                checked={permissions.type === 'all'}
                onChange={() => handlePermissionsModeChange('all')}
                className="rounded-full border-gray-300"
              />
              <span>All (full access to all pages and components)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-primary">
              <input
                type="radio"
                name="permissions-mode"
                checked={permissionsMode === 'custom'}
                onChange={() => handlePermissionsModeChange('custom')}
                className="rounded-full border-gray-300"
              />
              <span>Custom (select pages and components)</span>
            </label>
          </div>

          {permissionsMode === 'custom' && (
            <div className="space-y-4 pl-6 border-l-2 border-gray-200">
              {PERMISSION_PAGES.map((page) => {
                const pageChecked = hasPageInCustom(customPages, page.pageId);
                const entry = getPageEntry(customPages, page.pageId);
                const fullPageChecked =
                  pageChecked &&
                  (entry?.components == null || entry?.components?.includes(FULL_PAGE_COMPONENT_ID));
                return (
                  <div key={page.pageId} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={pageChecked}
                        onChange={(e) =>
                          setPageSelectAll(
                            permissions,
                            setPermissions,
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
                                    permissions,
                                    setPermissions,
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

      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-6 py-4">
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
          {submitButtonLabel}
        </button>
      </div>
    </form>
  );
}

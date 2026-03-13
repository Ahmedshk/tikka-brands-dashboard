import type { Dispatch, SetStateAction } from 'react';
import type { RoleRow, RolePermissions } from '../../types/rbac.types';
import type { LocationListItem } from '../../types';
import { AdditionalPermissionsEditor } from './AdditionalPermissionsEditor';
import { getPermissionBarRole, getPermissionBarStyle } from '../../utils/addUserModalPermissionHelpers';

export interface EditUserOverridesSectionProps {
  additionalLocationsOpen: boolean;
  setAdditionalLocationsOpen: Dispatch<SetStateAction<boolean>>;
  additionalPermissionsOpen: boolean;
  setAdditionalPermissionsOpen: Dispatch<SetStateAction<boolean>>;
  locations: LocationListItem[];
  roleLocationIdSet: Set<string>;
  locationOverrides: string[];
  setLocationOverrides: Dispatch<SetStateAction<string[]>>;
  locationRemovals: string[];
  setLocationRemovals: Dispatch<SetStateAction<string[]>>;
  permissionOverrides: RolePermissions | null;
  setPermissionOverrides: Dispatch<SetStateAction<RolePermissions | null>>;
  permissionRemovals: RolePermissions | null;
  setPermissionRemovals: Dispatch<SetStateAction<RolePermissions | null>>;
  roleId: string;
  roles: RoleRow[];
}

export function EditUserOverridesSection({
  additionalLocationsOpen,
  setAdditionalLocationsOpen,
  additionalPermissionsOpen,
  setAdditionalPermissionsOpen,
  locations,
  roleLocationIdSet,
  locationOverrides,
  setLocationOverrides,
  locationRemovals,
  setLocationRemovals,
  permissionOverrides,
  setPermissionOverrides,
  permissionRemovals,
  setPermissionRemovals,
  roleId,
  roles,
}: Readonly<EditUserOverridesSectionProps>) {
  const rolePermissions = roleId ? (roles.find((r) => r.id === roleId)?.permissions ?? null) : null;

  return (
    <div className="pt-4 border-t border-gray-200 space-y-4">
      {/* Locations – customize from role (add or remove) */}
      <div className="rounded-lg border-2 border-gray-200 bg-gray-50 overflow-hidden">
        <button
          type="button"
          onClick={() => setAdditionalLocationsOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 py-3 px-4 text-left hover:bg-gray-100/80 transition-colors"
          aria-expanded={additionalLocationsOpen}
        >
          <span className="font-semibold text-primary">Locations (customize from role)</span>
          <span className="text-gray-500 shrink-0" aria-hidden>
            {additionalLocationsOpen ? '▼' : '▶'}
          </span>
        </button>
        {additionalLocationsOpen && (
          <div className="px-4 pb-4 pt-0">
            <p className="text-xs text-secondary mb-2">
              Add or remove locations relative to the selected role. Checked = user has access; unchecked = no access.
            </p>
            <p className="text-xs text-secondary mb-3 flex items-center gap-2 flex-wrap" aria-hidden>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2 h-3.5 rounded-sm shrink-0" style={{ backgroundColor: '#5dc54f' }} aria-hidden />
                <span>= from role</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2 h-3.5 rounded-sm shrink-0" style={{ backgroundColor: '#FDB90E' }} aria-hidden />
                <span>= added for this user</span>
              </span>
            </p>
            <div className="pl-6 border-l-2 border-gray-200 max-h-40 overflow-y-auto space-y-1.5">
              {locations.length === 0 ? (
                <p className="text-xs text-secondary">No locations available.</p>
              ) : (
                locations.map((loc) => {
                  const id = loc._id == null ? '' : String(loc._id);
                  const fromRole = id && roleLocationIdSet.has(id);
                  const fromOverride = id && locationOverrides.some((x) => String(x) === id);
                  const removed = id && locationRemovals.some((x) => String(x) === id);
                  const checked = (fromRole || fromOverride) && !removed;
                  const addedOnly = fromOverride && !fromRole;
                  const barRole = getPermissionBarRole(Boolean(fromRole), Boolean(fromOverride || checked));
                  const locationBarClass = barRole === 'none' ? '' : 'border-l-2 pl-2';
                  const locationBarStyle = getPermissionBarStyle(barRole);
                  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                    e.stopPropagation();
                    if (!id) return;
                    const wantChecked = e.target.checked;
                    if (wantChecked) {
                      setLocationRemovals(locationRemovals.filter((x) => String(x) !== id));
                      if (!fromRole) {
                        const hasId = locationOverrides.some((x) => String(x) === id);
                        setLocationOverrides(hasId ? locationOverrides : [...locationOverrides, id]);
                      }
                    } else if (fromRole) {
                      const hasId = locationRemovals.some((x) => String(x) === id);
                      setLocationRemovals(hasId ? locationRemovals : [...locationRemovals, id]);
                    } else {
                      setLocationOverrides(locationOverrides.filter((x) => String(x) !== id));
                    }
                  };
                  return (
                    <div key={id} className={locationBarClass} style={locationBarStyle}>
                      <label className="flex items-center gap-2 text-sm text-primary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked === true}
                          onChange={handleLocationChange}
                          className="rounded border-gray-300"
                          aria-label={addedOnly ? `${loc.storeName ?? id} (added for this user)` : `${loc.storeName ?? id} (from role)`}
                        />
                        <span>{loc.storeName ?? id}</span>
                      </label>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pages and Components – customize from role (add or remove) */}
      <div className="rounded-lg border-2 border-gray-200 bg-gray-50 overflow-hidden">
        <button
          type="button"
          onClick={() => setAdditionalPermissionsOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 py-3 px-4 text-left hover:bg-gray-100/80 transition-colors"
          aria-expanded={additionalPermissionsOpen}
        >
          <span className="font-semibold text-primary">Pages and Components (customize from role)</span>
          <span className="text-gray-500 shrink-0" aria-hidden>
            {additionalPermissionsOpen ? '▼' : '▶'}
          </span>
        </button>
        {additionalPermissionsOpen && (
          <div className="px-4 pb-4 pt-0">
            <p className="text-xs text-secondary mb-2">
              Add or remove pages and components relative to the selected role. Checked = user has access; unchecked = no access.
            </p>
            <p className="text-xs text-secondary mb-3 flex items-center gap-2 flex-wrap" aria-hidden>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2 h-3.5 rounded-sm shrink-0" style={{ backgroundColor: '#5dc54f' }} aria-hidden />
                <span>= from role</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2 h-3.5 rounded-sm shrink-0" style={{ backgroundColor: '#FDB90E' }} aria-hidden />
                <span>= added for this user</span>
              </span>
            </p>
            <AdditionalPermissionsEditor
              permissionOverrides={permissionOverrides}
              setPermissionOverrides={setPermissionOverrides}
              permissionRemovals={permissionRemovals}
              setPermissionRemovals={setPermissionRemovals}
              rolePermissions={rolePermissions}
            />
          </div>
        )}
      </div>
    </div>
  );
}

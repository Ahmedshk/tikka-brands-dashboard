import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import type { RoleRow, RolePermissions, RoleLocations, PagePermission } from '../../types/rbac.types';
import type { LocationListItem } from '../../types';
import { RootState } from '../../store/store';
import { roleService } from '../../services/role.service';
import { locationService } from '../../services/location.service';
import {
  applyInitialFormState,
  hasPageInCustom,
  RBAC_PAGE_ID,
} from '../../utils/addEditRoleModalHelpers';
import { AddEditRoleModalBody } from './AddEditRoleModalBody';

interface RoleOption {
  id: string;
  name: string;
}

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

export function AddEditRoleModal({
  open,
  onClose,
  initialRole,
  isDuplicate = false,
  onSaved,
  onError,
}: Readonly<AddEditRoleModalProps>) {
  const user = useSelector((state: RootState) => state.auth.user);
  const currentUserRoleName = user?.role ?? null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<RolePermissions>({ type: 'all' });
  const [locationsMode, setLocationsMode] = useState<'all' | 'none' | 'specific'>('all');
  const [locations, setLocations] = useState<RoleLocations>('all');
  const [permissionsMode, setPermissionsMode] = useState<'all' | 'none' | 'custom'>('all');
  const [locationsList, setLocationsList] = useState<LocationListItem[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [reportsTo, setReportsTo] = useState<string | null>(null);
  const [availableRoles, setAvailableRoles] = useState<RoleOption[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

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
    applyInitialFormState(initialRole, isDuplicate, {
      setName,
      setDescription,
      setPermissions,
      setPermissionsMode,
      setLocationsMode,
      setLocations,
      setNameTouched,
      setReportsTo,
    });
  }, [open, initialRole, isDuplicate]);

  useEffect(() => {
    if (!open) return;
    setLocationsLoading(true);
    locationService
      .getAll()
      .then(setLocationsList)
      .catch(() => setLocationsList([]))
      .finally(() => setLocationsLoading(false));

    roleService
      .list(true)
      .then((roles) => {
        const editingId = isEdit ? initialRole?.id : null;
        setAvailableRoles(
          roles
            .filter((r) => r.id != null && r.id !== editingId && r.isSystem !== true)
            .map((r) => ({ id: r.id!, name: r.roleName }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      })
      .catch(() => setAvailableRoles([]));
  }, [open, isEdit, initialRole?.id]);

  const handlePermissionsModeChange = (mode: 'all' | 'none' | 'custom') => {
    setPermissionsMode(mode);
    if (mode === 'all') {
      setPermissions({ type: 'all' });
      return;
    }
    let pages: PagePermission[];
    if (mode === 'none') {
      pages = [];
    } else {
      pages = permissions.type === 'custom' ? permissions.pages : [];
    }
    setPermissions({ type: 'custom', pages });
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
      let payloadLocations: RoleLocations = locations;
      if (locationsMode === 'all') payloadLocations = 'all';
      else if (locationsMode === 'none') payloadLocations = [];
      const payload = {
        name: trimmedName,
        description: description.trim() || undefined,
        permissions,
        locations: payloadLocations,
        reportsTo,
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

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-50 m-0 grid place-items-center border-0 bg-transparent p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="add-edit-role-title"
      onClose={onClose}
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-2xl">
        <button
          type="button"
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>

        <div className="relative max-h-[90vh] flex flex-col bg-primary rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-6 py-3 flex-shrink-0">
            <h2 id="add-edit-role-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              {isEdit ? 'Edit Role' : 'Add Role'}
            </h2>
          </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card-background">
          <AddEditRoleModalBody
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          permissions={permissions}
          setPermissions={setPermissions}
          permissionsMode={permissionsMode}
          handlePermissionsModeChange={handlePermissionsModeChange}
          locationsMode={locationsMode}
          setLocationsMode={setLocationsMode}
          locations={locations}
          setLocations={setLocations}
          locationsList={locationsList}
          locationsLoading={locationsLoading}
          nameTouched={nameTouched}
          setNameTouched={setNameTouched}
          isEdit={isEdit}
          initialRole={initialRole}
          selfLockoutBlock={selfLockoutBlock}
          saving={saving}
          onClose={onClose}
          onSubmit={handleSubmit}
          reportsTo={reportsTo}
          setReportsTo={setReportsTo}
          availableRoles={availableRoles}
        />
        </div>
        </div>
      </div>
    </dialog>,
    document.body
  );
}

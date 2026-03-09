import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import type { RoleRow, RolePermissions, RoleLocations, PagePermission } from '../../types/rbac.types';
import type { Location } from '../../types';
import { RootState } from '../../store/store';
import { roleService } from '../../services/role.service';
import { locationService } from '../../services/location.service';
import {
  applyInitialFormState,
  hasPageInCustom,
  RBAC_PAGE_ID,
} from '../../utils/addEditRoleModalHelpers';
import { AddEditRoleModalBody } from './AddEditRoleModalBody';

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
  const [locationsList, setLocationsList] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
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
  }, [open]);

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
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-0 grid h-screen w-full max-w-none max-h-none place-items-center border-0 bg-transparent p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="add-edit-role-title"
      onClose={onClose}
    >
      <div className="bg-card-background rounded-xl shadow-lg border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 id="add-edit-role-title" className="text-lg font-semibold text-primary">
            {isEdit ? 'Edit Role' : 'Add Role'}
          </h2>
        </div>
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
        />
      </div>
    </dialog>
  );
}

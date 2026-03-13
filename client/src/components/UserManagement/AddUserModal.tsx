import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { userService } from '../../services/user.service';
import { roleService } from '../../services/role.service';
import { locationService } from '../../services/location.service';
import type { RoleRow, RolePermissions, RoleLocationsResponse } from '../../types/rbac.types';
import type { UserRow } from '../../types/userManagement.types';
import type { LocationListItem } from '../../types';
import { ConfirmDialog } from '../modal/ConfirmDialog';
import { FilterSelect } from '../common/FilterSelect';
import { EditUserOverridesSection } from './EditUserOverridesSection';
import {
  validateAddUserForm,
  resolveProfileImagePublicId,
  getSaveErrorMessage,
  getProfileAvatarContent,
} from '../../utils/addUserModalHelpers';
import { normalizeLocationsToIds } from '../../utils/addEditRoleModalHelpers';

const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const PROFILE_IMAGE_ACCEPT = 'image/jpeg,image/jpg,image/webp,image/png';

export interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError?: (message: string) => void;
  /** When set, modal is in edit mode: prefill form and call updateUser on save. */
  initialUser?: UserRow | null;
}

export function AddUserModal({ open, onClose, onSaved, onError, initialUser }: Readonly<AddUserModalProps>) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [squareId, setSquareId] = useState('');
  const [homebaseId, setHomebaseId] = useState('');
  const [roleId, setRoleId] = useState<string>('');
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [pendingProfileImagePublicId, setPendingProfileImagePublicId] = useState<string | null>(null);
  const [removeProfileImage, setRemoveProfileImage] = useState(false);
  const [showInviteConfirm, setShowInviteConfirm] = useState(false);
  const [permissionOverrides, setPermissionOverrides] = useState<RolePermissions | null>(null);
  const [permissionRemovals, setPermissionRemovals] = useState<RolePermissions | null>(null);
  const [locationOverrides, setLocationOverrides] = useState<string[]>([]);
  const [locationRemovals, setLocationRemovals] = useState<string[]>([]);
  const [locations, setLocations] = useState<LocationListItem[]>([]);
  const [additionalLocationsOpen, setAdditionalLocationsOpen] = useState(false);
  const [additionalPermissionsOpen, setAdditionalPermissionsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEdit = Boolean(initialUser?._id);
  const selectedRole = roleId ? roles.find((r) => r.id === roleId) : null;
  const roleLocationIdSet = useMemo(() => {
    if (!selectedRole?.locations || !locations.length) return new Set<string>();
    const locs = selectedRole.locations as RoleLocationsResponse | undefined;
    const toId = (l: { _id?: string }) => (l._id == null ? '' : String(l._id));
    const allIds = locations.map(toId).filter(Boolean);
    if (locs == null || locs === 'all') return new Set(allIds);
    if (!Array.isArray(locs)) return new Set(allIds);
    const ids = normalizeLocationsToIds(locs);
    return ids === 'all' ? new Set(allIds) : new Set(ids.map(String));
  }, [selectedRole, locations]);
  const currentProfileImageUrl = initialUser?.profileImageUrl ?? null;

  useEffect(() => {
    if (!open) return;
    if (initialUser) {
      setFirstName(initialUser.firstName ?? '');
      setLastName(initialUser.lastName ?? '');
      setPhone(initialUser.phone ?? '');
      setEmail(initialUser.email ?? '');
      setSquareId(initialUser.squareId ?? '');
      setHomebaseId(initialUser.homebaseId ?? '');
      setRoleId(initialUser.roleId ?? '');
      const overrides = initialUser.permissionOverrides;
      if (overrides?.type === 'custom' && Array.isArray(overrides.pages) && overrides.pages.length > 0) {
        setPermissionOverrides(overrides);
      } else {
        setPermissionOverrides(null);
      }
      setLocationOverrides(initialUser.locationOverrides ?? []);
      const removals = initialUser.permissionRemovals;
      if (removals?.type === 'custom' && Array.isArray(removals.pages) && removals.pages.length > 0) {
        setPermissionRemovals(removals);
      } else {
        setPermissionRemovals(null);
      }
      setLocationRemovals(initialUser.locationRemovals ?? []);
    } else {
      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail('');
      setSquareId('');
      setHomebaseId('');
      setRoleId('');
      setPermissionOverrides(null);
      setPermissionRemovals(null);
      setLocationOverrides([]);
      setLocationRemovals([]);
    }
    setProfileImageFile(null);
    setProfileImagePreview(null);
    setPendingProfileImagePublicId(null);
    setRemoveProfileImage(false);
    setAdditionalLocationsOpen(false);
    setAdditionalPermissionsOpen(false);
    roleService.list().then(setRoles).catch(() => setRoles([]));
    locationService.getAll().then(setLocations).catch(() => setLocations([]));
  }, [open, initialUser]);

  useEffect(() => {
    if (!profileImageFile) {
      if (profileImagePreview) {
        URL.revokeObjectURL(profileImagePreview);
        setProfileImagePreview(null);
      }
      return;
    }
    const url = URL.createObjectURL(profileImageFile);
    setProfileImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [profileImageFile]);

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setRemoveProfileImage(false);
    if (!file) {
      setProfileImageFile(null);
      setPendingProfileImagePublicId(null);
      return;
    }
    const allowed = ['image/jpeg', 'image/jpg', 'image/webp', 'image/png'];
    if (!allowed.includes(file.type)) {
      onError?.('Invalid file type. Use JPEG, JPG, WebP or PNG.');
      return;
    }
    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      onError?.('Profile image must be 2 MB or less.');
      return;
    }
    setProfileImageFile(file);
    setPendingProfileImagePublicId(null);
  };

  const handleSubmit = async (invite: boolean) => {
    const validation = validateAddUserForm(firstName, lastName, email);
    if ('error' in validation) {
      onError?.(validation.error);
      return;
    }
    const { trimmedFirst, trimmedLast, trimmedEmail } = validation;

    setSaving(true);
    try {
      const profileImagePublicId = await resolveProfileImagePublicId(
        userService.uploadProfileImage,
        {
          profileImageFile,
          isEdit,
          removeProfileImage,
          pendingProfileImagePublicId,
        }
      );

      if (isEdit && initialUser?._id) {
        await userService.updateUser(initialUser._id, {
          firstName: trimmedFirst,
          lastName: trimmedLast,
          email: trimmedEmail,
          phone: phone.trim() || undefined,
          squareId: squareId.trim() || undefined,
          homebaseId: homebaseId.trim() || undefined,
          roleId: roleId.trim() || null,
          ...(profileImagePublicId !== undefined && { profileImagePublicId }),
          permissionOverrides: permissionOverrides ?? null,
          permissionRemovals: permissionRemovals ?? null,
          locationOverrides: locationOverrides.length ? locationOverrides : null,
          locationRemovals: locationRemovals.length ? locationRemovals : null,
        });
      } else {
        await userService.createUser({
          firstName: trimmedFirst,
          lastName: trimmedLast,
          email: trimmedEmail,
          phone: phone.trim() || undefined,
          squareId: squareId.trim() || undefined,
          homebaseId: homebaseId.trim() || undefined,
          roleId: roleId.trim() || null,
          invite,
          ...(profileImagePublicId != null && profileImagePublicId !== '' && { profileImagePublicId }),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      onError?.(getSaveErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const profileAvatarContent = getProfileAvatarContent(
    profileImagePreview,
    currentProfileImageUrl,
    removeProfileImage,
    firstName,
    initialUser?.firstName
  );

  return createPortal(
    <dialog
      open
      onCancel={onClose}
      className="modal-full-viewport z-50 flex items-center justify-center p-4 m-0 border-0 bg-black/50 backdrop:bg-black/50"
      aria-labelledby="add-user-title"
    >
      <button
        type="button"
        className="absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div className="relative bg-card-background rounded-xl shadow-lg border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 id="add-user-title" className="text-lg font-semibold text-primary">
            {isEdit ? 'Edit User' : 'Add User'}
          </h2>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {/* Profile image first */}
          <div>
            <label htmlFor="user-profile-image" className="block text-sm font-medium text-primary mb-1">
              Profile image (optional, max 2 MB, JPEG/PNG/WebP)
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-14 h-14 rounded-full border border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                {profileAvatarContent}
              </div>
              <div className="flex flex-col gap-1">
                <input
                  id="user-profile-image"
                  ref={fileInputRef}
                  type="file"
                  accept={PROFILE_IMAGE_ACCEPT}
                  className="hidden"
                  onChange={handleProfileImageChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-primary hover:bg-gray-50"
                >
                  {profileImageFile || currentProfileImageUrl ? 'Change' : 'Upload'}
                </button>
                {(profileImagePreview || currentProfileImageUrl) && !removeProfileImage && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileImageFile(null);
                      setRemoveProfileImage(true);
                    }}
                    className="text-sm text-negative hover:underline"
                  >
                    Remove image
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="user-first-name" className="block text-sm font-medium text-primary mb-1">
                First name <span className="text-negative">*</span>
              </label>
              <input
                id="user-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-primary"
                placeholder="First name"
              />
            </div>
            <div>
              <label htmlFor="user-last-name" className="block text-sm font-medium text-primary mb-1">
                Last name <span className="text-negative">*</span>
              </label>
              <input
                id="user-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-primary"
                placeholder="Last name"
              />
            </div>
          </div>
          <div>
            <label htmlFor="user-phone" className="block text-sm font-medium text-primary mb-1">
              Phone number (optional)
            </label>
            <input
              id="user-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-primary"
              placeholder="Phone"
            />
          </div>
          <div>
            <label htmlFor="user-email" className="block text-sm font-medium text-primary mb-1">
              Email <span className="text-negative">*</span>
            </label>
            <input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-primary"
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label htmlFor="user-square-id" className="block text-sm font-medium text-primary mb-1">
              Square ID (optional)
            </label>
            <input
              id="user-square-id"
              type="text"
              value={squareId}
              onChange={(e) => setSquareId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-primary"
              placeholder="Square ID"
            />
          </div>
          <div>
            <label htmlFor="user-homebase-id" className="block text-sm font-medium text-primary mb-1">
              Homebase ID (optional)
            </label>
            <input
              id="user-homebase-id"
              type="text"
              value={homebaseId}
              onChange={(e) => setHomebaseId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-primary"
              placeholder="Homebase ID"
            />
          </div>
          <div>
            <label htmlFor="user-role" className="block text-sm font-medium text-primary mb-1">
              Role (optional)
            </label>
            <FilterSelect
              value={roleId}
              onChange={setRoleId}
              options={roles.map((r) => ({ value: r.id ?? '', label: r.roleName }))}
              placeholder="Role unassigned"
              aria-label="Role"
              openAbove={true}
            />
          </div>

          {isEdit && (
            <EditUserOverridesSection
              additionalLocationsOpen={additionalLocationsOpen}
              setAdditionalLocationsOpen={setAdditionalLocationsOpen}
              additionalPermissionsOpen={additionalPermissionsOpen}
              setAdditionalPermissionsOpen={setAdditionalPermissionsOpen}
              locations={locations}
              roleLocationIdSet={roleLocationIdSet}
              locationOverrides={locationOverrides}
              setLocationOverrides={setLocationOverrides}
              locationRemovals={locationRemovals}
              setLocationRemovals={setLocationRemovals}
              permissionOverrides={permissionOverrides}
              setPermissionOverrides={setPermissionOverrides}
              permissionRemovals={permissionRemovals}
              setPermissionRemovals={setPermissionRemovals}
              roleId={roleId}
              roles={roles}
            />
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-primary hover:bg-gray-50"
          >
            Cancel
          </button>
          {isEdit ? (
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-button-primary text-white font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowInviteConfirm(true)}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-button-primary text-white font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create and invite'}
              </button>
            </>
          )}
        </div>
      </div>
      {showInviteConfirm && (
        <ConfirmDialog
          isOpen={showInviteConfirm}
          onClose={() => setShowInviteConfirm(false)}
          title="Send invitation"
          message={`An invitation email with a temporary password will be sent to ${email.trim() || 'this user'}. Continue?`}
          confirmLabel="Send invitation"
          cancelLabel="Cancel"
          onConfirm={async () => {
            setShowInviteConfirm(false);
            await handleSubmit(true);
          }}
          isLoading={saving}
        />
      )}
    </dialog>,
    document.body
  );
}

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
  formatToMmDdYyyy,
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
  const [homebaseDataId, setHomebaseDataId] = useState('');
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
  const [startDate, setStartDate] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

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
      setHomebaseDataId(initialUser.homebaseData?.id ?? '');
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
      setStartDate(initialUser.startDate ? formatToMmDdYyyy(initialUser.startDate) : '');
    } else {
      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail('');
      setSquareId('');
      setHomebaseDataId('');
      setRoleId('');
      setPermissionOverrides(null);
      setPermissionRemovals(null);
      setLocationOverrides([]);
      setLocationRemovals([]);
      setStartDate('');
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

  useEffect(() => {
    if (!open) return;
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, [open]);

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
    const validation = validateAddUserForm(firstName, lastName, email, startDate);
    if ('error' in validation) {
      onError?.(validation.error);
      return;
    }
    const { trimmedFirst, trimmedLast, trimmedEmail, trimmedStartDate } = validation;

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
          homebaseData: homebaseDataId.trim() ? { id: homebaseDataId.trim() } : undefined,
          roleId: roleId.trim() || null,
          ...(profileImagePublicId !== undefined && { profileImagePublicId }),
          permissionOverrides: permissionOverrides ?? null,
          permissionRemovals: permissionRemovals ?? null,
          locationOverrides: locationOverrides.length ? locationOverrides : null,
          locationRemovals: locationRemovals.length ? locationRemovals : null,
          startDate: trimmedStartDate,
        });
      } else {
        await userService.createUser({
          firstName: trimmedFirst,
          lastName: trimmedLast,
          email: trimmedEmail,
          phone: phone.trim() || undefined,
          squareId: squareId.trim() || undefined,
          homebaseData: homebaseDataId.trim() ? { id: homebaseDataId.trim() } : undefined,
          roleId: roleId.trim() || null,
          invite,
          ...(profileImagePublicId != null && profileImagePublicId !== '' && { profileImagePublicId }),
          startDate: trimmedStartDate,
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
      ref={dialogRef}
      className="modal-full-viewport z-50 m-0 grid place-items-center border-0 bg-transparent p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="add-user-title"
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
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2 id="add-user-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              {isEdit ? 'Edit User' : 'Add User'}
            </h2>
          </div>
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-4 space-y-4 border-x border-gray-200">
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
            <label htmlFor="user-start-date" className="block text-sm font-medium text-primary mb-1">
              Start date <span className="text-negative">*</span>
            </label>
            <input
              id="user-start-date"
              type="text"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-primary"
              placeholder="MM/DD/YYYY"
              aria-label="Start date (MM/DD/YYYY)"
              required
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
              value={homebaseDataId}
              onChange={(e) => setHomebaseDataId(e.target.value)}
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
            <div className="px-5 py-4 border-t border-gray-200 flex flex-wrap justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              dialogRef.current?.close();
              onClose();
            }}
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

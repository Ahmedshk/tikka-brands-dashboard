import { createElement, type ReactNode } from 'react';

export interface ValidatedUserForm {
  trimmedFirst: string;
  trimmedLast: string;
  trimmedEmail: string;
}

/**
 * Validates add/edit user form fields. Returns either an error message or the normalized field values.
 */
export function validateAddUserForm(
  firstName: string,
  lastName: string,
  email: string
): { error: string } | ValidatedUserForm {
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  if (!trimmedFirst || !trimmedLast) {
    return { error: 'First name and last name are required.' };
  }
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) {
    return { error: 'Email is required.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { error: 'Please enter a valid email address.' };
  }
  return { trimmedFirst, trimmedLast, trimmedEmail };
}

export interface ResolveProfileImageParams {
  profileImageFile: File | null;
  isEdit: boolean;
  removeProfileImage: boolean;
  pendingProfileImagePublicId: string | null;
}

/**
 * Resolves the profileImagePublicId to send with create/update (upload new, clear, or keep existing).
 */
export async function resolveProfileImagePublicId(
  uploadProfileImage: (file: File) => Promise<{ profileImagePublicId?: string | null }>,
  params: ResolveProfileImageParams
): Promise<string | null | undefined> {
  if (params.profileImageFile) {
    const { profileImagePublicId } = await uploadProfileImage(params.profileImageFile);
    return profileImagePublicId;
  }
  if (params.isEdit && params.removeProfileImage) {
    return null;
  }
  if (params.isEdit && params.pendingProfileImagePublicId) {
    return params.pendingProfileImagePublicId;
  }
  return undefined;
}

/**
 * Returns a user-facing error message from an unknown caught value.
 */
export function getSaveErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Failed to save user';
}

/**
 * Returns the profile avatar content for the add/edit user modal: preview image, current URL image, or initial letter.
 */
export function getProfileAvatarContent(
  profileImagePreview: string | null,
  currentProfileImageUrl: string | null,
  removeProfileImage: boolean,
  firstName: string,
  initialUserFirstName?: string
): ReactNode {
  if (profileImagePreview) {
    return createElement('img', { src: profileImagePreview, alt: '', className: 'w-full h-full object-cover' });
  }
  if (currentProfileImageUrl && !removeProfileImage) {
    return createElement('img', { src: currentProfileImageUrl, alt: '', className: 'w-full h-full object-cover' });
  }
  const initial = (firstName.trim() || initialUserFirstName)?.[0]?.toUpperCase() ?? '?';
  return createElement('span', { className: 'text-gray-400 text-lg font-medium' }, initial);
}

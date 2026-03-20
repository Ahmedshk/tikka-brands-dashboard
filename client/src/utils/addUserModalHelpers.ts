import { createElement, type ReactNode } from 'react';

export interface ValidatedUserForm {
  trimmedFirst: string;
  trimmedLast: string;
  trimmedEmail: string;
  /** ISO date string (yyyy-mm-dd) for API */
  trimmedStartDate: string;
}

const MM_DD_YYYY_REG = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * Parse mm/dd/yyyy string to Date. Returns null if invalid.
 */
export function parseMmDdYyyy(value: string): Date | null {
  const trimmed = value.trim();
  const m = MM_DD_YYYY_REG.exec(trimmed);
  if (!m) return null;
  const month = Number.parseInt(m[1], 10);
  const day = Number.parseInt(m[2], 10);
  const year = Number.parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

/**
 * Format a Date or ISO date string to mm/dd/yyyy.
 */
export function formatToMmDdYyyy(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date.trim()) : date;
  if (!Number.isFinite(d.getTime())) return '';
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
}

/**
 * Validates add/edit user form fields. Returns either an error message or the normalized field values.
 * startDate must be in mm/dd/yyyy format; returned trimmedStartDate is ISO (yyyy-mm-dd) for the API.
 */
export function validateAddUserForm(
  firstName: string,
  lastName: string,
  email: string,
  startDate: string
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
  const trimmedStartDate = startDate.trim();
  if (!trimmedStartDate) {
    return { error: 'Start date is required.' };
  }
  // Accept ISO (yyyy-mm-dd) from date picker or mm/dd/yyyy from text input
  let isoDate: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedStartDate)) {
    const d = new Date(trimmedStartDate);
    if (!Number.isFinite(d.getTime())) {
      return { error: 'Please enter a valid start date.' };
    }
    isoDate = trimmedStartDate;
  } else {
    const parsed = parseMmDdYyyy(trimmedStartDate);
    if (!parsed) {
      return { error: 'Start date must be in mm/dd/yyyy format.' };
    }
    isoDate = `${parsed.getFullYear()}-${(parsed.getMonth() + 1).toString().padStart(2, '0')}-${parsed.getDate().toString().padStart(2, '0')}`;
  }
  return { trimmedFirst, trimmedLast, trimmedEmail, trimmedStartDate: isoDate };
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

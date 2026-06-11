import { formatInTimeZone } from 'date-fns-tz';
import {
  ALL_LOCATIONS_DISPLAY_TIMEZONE,
  resolveDisplayTimezone,
} from './displayTimezoneHelpers';

/** @deprecated Use ALL_LOCATIONS_DISPLAY_TIMEZONE */
export const ALL_LOCATIONS_RATINGS_TIMEZONE = ALL_LOCATIONS_DISPLAY_TIMEZONE;

/** @deprecated Use resolveDisplayTimezone */
export const resolveRatingsDisplayTimezone = resolveDisplayTimezone;

/** Trim and validate Google-hosted reviewer photo URLs (often blocked without no-referrer). */
export function normalizeGoogleProfilePhotoUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

export function getReviewerInitial(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
}

export function formatReviewDate(iso: string, timezone: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return formatInTimeZone(d, timezone, 'MMM d, yyyy h:mm a');
  } catch {
    return iso;
  }
}

export function reviewWasUpdated(createTime: string, updateTime: string): boolean {
  const created = new Date(createTime).getTime();
  const updated = new Date(updateTime).getTime();
  if (Number.isNaN(created) || Number.isNaN(updated)) return false;
  return updated > created;
}

export function renderStars(numeric: number): string {
  const full = Math.round(numeric);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}

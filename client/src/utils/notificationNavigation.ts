import type { NotificationItem } from '../services/notification.service';
import type { LocationListItem } from '../types';

export type NotificationNavTarget = { path: string; pageId: string };

function stringDataField(
  data: Record<string, unknown> | undefined,
  key: string,
): string | null {
  if (!data) return null;
  const v = data[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Human-readable location for the notification row: store name only (no address), from navbar list or API `locationLabel`.
 */
export function resolveNotificationLocationLabel(
  n: NotificationItem,
  locations: LocationListItem[],
): string | null {
  const lid = stringDataField(n.data, 'locationId');
  if (lid) {
    const loc = locations.find((l) => l._id === lid);
    const name = loc?.storeName?.trim();
    if (name) return name;
  }
  const fromApi = n.locationLabel?.trim();
  if (fromApi) return fromApi;
  return null;
}

function alertLocationPrefixCandidates(
  n: NotificationItem,
  locations: LocationListItem[],
): string[] {
  const lid = stringDataField(n.data, 'locationId');
  const loc = lid ? locations.find((l) => l._id === lid) : undefined;

  const candidates: string[] = [];
  if (loc) {
    const name = loc.storeName?.trim() ?? '';
    if (name) candidates.push(name);
  }
  const apiLabel = n.locationLabel?.trim();
  if (apiLabel) candidates.push(apiLabel);

  const dataLocName =
    n.data && typeof n.data.locationName === 'string' ? n.data.locationName.trim() : '';
  if (dataLocName) candidates.push(dataLocName);

  candidates.push('Location');

  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (!c || seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}

function stripLeadingLocationColonPrefix(message: string, prefixesLongestFirst: string[]): string {
  for (const prefix of prefixesLongestFirst) {
    const withColonSpace = `${prefix}: `;
    if (message.startsWith(withColonSpace)) {
      return message.slice(withColonSpace.length).trimStart();
    }
    const withColon = `${prefix}:`;
    if (message.startsWith(withColon)) {
      return message.slice(withColon.length).trimStart();
    }
  }
  return message;
}

/**
 * Alert notifications are stored with a `{location}:` prefix in `message`; strip it in the dropdown when the location is shown on its own line.
 */
export function alertNotificationBodyTextForDropdown(
  message: string,
  n: NotificationItem,
  locations: LocationListItem[],
): string {
  if (!n.type.startsWith('alert_')) return message;
  const unique = alertLocationPrefixCandidates(n, locations);
  unique.sort((a, b) => b.length - a.length);
  return stripLeadingLocationColonPrefix(message, unique);
}

/**
 * Dashboard route + permission pageId for in-app notification types.
 */
export function getNotificationNavigationTarget(
  n: NotificationItem,
): NotificationNavTarget | null {
  const { type, data } = n;

  if (type === 'alert_inventory_delivery_overdue') {
    return { path: '/dashboard/inventory-food-cost', pageId: 'inventory-food-cost' };
  }
  if (type === 'alert_inventory_low_inventory') {
    return { path: '/dashboard/command-center', pageId: 'command-center' };
  }
  if (type === 'alert_training_overdue') {
    return { path: '/dashboard/training-management', pageId: 'training-management' };
  }
  if (type === 'alert_pip_pending') {
    return { path: '/dashboard/disciplinary-management', pageId: 'disciplinary-management' };
  }
  if (type.startsWith('alert_')) {
    return { path: '/dashboard/command-center', pageId: 'command-center' };
  }
  if (type.startsWith('calendar_event_')) {
    return { path: '/dashboard/calendar-events', pageId: 'calendar-events' };
  }
  if (type.startsWith('disciplinary_')) {
    const employeeId = stringDataField(data, 'employeeId');
    if (employeeId) {
      return {
        path: `/dashboard/disciplinary-management/${encodeURIComponent(employeeId)}`,
        pageId: 'disciplinary-management-details',
      };
    }
    return { path: '/dashboard/disciplinary-management', pageId: 'disciplinary-management' };
  }
  if (type.startsWith('review_')) {
    return { path: '/dashboard/reviews-management', pageId: 'reviews-management' };
  }
  if (type === 'general') {
    return null;
  }
  return null;
}

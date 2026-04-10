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
 * Human-readable location for the notification row: API `locationLabel` or navbar locations list.
 */
export function resolveNotificationLocationLabel(
  n: NotificationItem,
  locations: LocationListItem[],
): string | null {
  const fromApi = n.locationLabel?.trim();
  if (fromApi) return fromApi;
  const lid = stringDataField(n.data, 'locationId');
  if (!lid) return null;
  const loc = locations.find((l) => l._id === lid);
  const name = loc?.storeName?.trim();
  return name ?? null;
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

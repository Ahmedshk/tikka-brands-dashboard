/** Prevents duplicate mark-read API calls (e.g. React Strict Mode or click + URL hook). */
const urlNotificationMarkReadClaimed = new Set<string>();

export function claimUrlNotificationMarkRead(notificationId: string): boolean {
  if (urlNotificationMarkReadClaimed.has(notificationId)) return false;
  urlNotificationMarkReadClaimed.add(notificationId);
  return true;
}

/** Prevents duplicate location switches from notification deep-link query params. */
const urlNotificationLocationClaimed = new Set<string>();

export function claimNotificationLocationFromUrl(locationId: string): boolean {
  if (urlNotificationLocationClaimed.has(locationId)) return false;
  urlNotificationLocationClaimed.add(locationId);
  return true;
}

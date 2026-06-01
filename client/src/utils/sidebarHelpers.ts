/** On these pages the sidebar always shows the default logo (location change does not affect it). */
export const SIDEBAR_DEFAULT_LOGO_PATHS = new Set([
  '/dashboard/user-management',
  '/dashboard/rbac-management',
  '/dashboard/goal-setting',
  '/dashboard/location-management',
  '/dashboard/training-settings',
  '/dashboard/review-settings',
  '/dashboard/disciplinary-settings',
  '/dashboard/events-notifications-settings',
  '/dashboard/alerts-notifications-settings',
  '/dashboard/data-sync-settings',
]);

export const SIDEBAR_WIDTH = 256;
export const DRAG_THRESHOLD = 50;

/** Constrain drag offset when sidebar is open (closing drag: negative offset). */
export function getConstrainedDragOffsetWhenOpen(diff: number): number {
  return Math.min(0, Math.max(-SIDEBAR_WIDTH, diff));
}

/** Constrain drag offset when sidebar is closed (opening drag: positive offset). */
export function getConstrainedDragOffsetWhenClosed(diff: number): number {
  return Math.max(0, Math.min(SIDEBAR_WIDTH, diff));
}

/** Handle drag end when sidebar is open: close if dragged left past threshold. */
export function applyDragEndWhenOpen(diff: number, onClose: () => void): void {
  if (diff < -DRAG_THRESHOLD) onClose();
}

/** Handle drag end when sidebar is closed: open if dragged right past threshold. */
export function applyDragEndWhenClosed(diff: number, onToggle: () => void): void {
  if (diff > DRAG_THRESHOLD) onToggle();
}

/** Transform string when sidebar is open (dragging or resting). */
export function getMobileSidebarTransformWhenOpen(isDragging: boolean, dragOffset: number): string {
  if (isDragging) return `translateX(${dragOffset}px)`;
  return 'translateX(0)';
}

/** Transform string when sidebar is closed (dragging or resting). */
export function getMobileSidebarTransformWhenClosed(isDragging: boolean, dragOffset: number): string {
  if (isDragging) return `translateX(${-SIDEBAR_WIDTH + dragOffset}px)`;
  return 'translateX(-100%)';
}

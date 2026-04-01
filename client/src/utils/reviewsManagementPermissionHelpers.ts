import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { canAccessComponent, getEffectivePermissions } from '../config/permissions.config';
import type { RolePermissions } from '../types/rbac.types';
import type { RootState } from '../store/store';

export const REVIEWS_MANAGEMENT_PAGE_ID = 'reviews-management';

/** Legacy component ids that implied access to the Review Cycles table before it was granular. */
const LEGACY_REVIEW_CYCLES_COMPONENT_IDS = [
  'review-tracker-chart',
  'staff-list',
  'kpi-office-staff',
  'kpi-reviews-due',
  'recently-completed-reviews',
] as const;

/** Maps `trackerDonuts` `id` (stage key) to RBAC component id. */
const TRACKER_DONUT_ID_TO_COMPONENT_ID: Record<string, string> = {
  selfReview: 'self-review-completion-chart',
  managerReview: 'manager-review-completion-chart',
  directorReview: 'do-review-completion-chart',
  finalReview: 'final-review-completion-chart',
  checkin30: 'checkin-30-completion-chart',
  checkin60: 'checkin-60-completion-chart',
};

function effectivePermissionsForUser(
  permissions: RolePermissions | undefined,
  permissionOverrides: RolePermissions | null | undefined,
  permissionRemovals: RolePermissions | null | undefined
): RolePermissions | undefined {
  return getEffectivePermissions(permissions, permissionOverrides ?? null, permissionRemovals ?? null) ?? permissions;
}

/** Per completion chart: new id or legacy `review-tracker-chart`. */
export function canAccessReviewsTrackerDonut(
  permissions: RolePermissions | undefined,
  donutStageId: string
): boolean {
  const componentId = TRACKER_DONUT_ID_TO_COMPONENT_ID[donutStageId];
  if (!componentId) return false;
  if (canAccessComponent(permissions, REVIEWS_MANAGEMENT_PAGE_ID, componentId)) return true;
  return canAccessComponent(permissions, REVIEWS_MANAGEMENT_PAGE_ID, 'review-tracker-chart');
}

/** Past reviews section: new id or legacy `staff-list`. */
export function canAccessReviewsPastReviews(permissions: RolePermissions | undefined): boolean {
  if (canAccessComponent(permissions, REVIEWS_MANAGEMENT_PAGE_ID, 'past-reviews')) return true;
  return canAccessComponent(permissions, REVIEWS_MANAGEMENT_PAGE_ID, 'staff-list');
}

/** Review cycles card/table/modals: new id or any legacy id that previously co-existed with that UI. */
export function canAccessReviewsReviewCycles(permissions: RolePermissions | undefined): boolean {
  if (canAccessComponent(permissions, REVIEWS_MANAGEMENT_PAGE_ID, 'review-cycles')) return true;
  for (const id of LEGACY_REVIEW_CYCLES_COMPONENT_IDS) {
    if (canAccessComponent(permissions, REVIEWS_MANAGEMENT_PAGE_ID, id)) return true;
  }
  return false;
}

export function useReviewsManagementSectionAccess(): {
  canShowDonut: (donutStageId: string) => boolean;
  canPastReviews: () => boolean;
  canReviewCycles: () => boolean;
} {
  const user = useSelector((s: RootState) => s.auth.user);
  const perms = useMemo(
    () =>
      effectivePermissionsForUser(
        user?.permissions,
        user?.permissionOverrides ?? null,
        user?.permissionRemovals ?? null
      ),
    [user?.permissions, user?.permissionOverrides, user?.permissionRemovals]
  );

  return useMemo(
    () => ({
      canShowDonut: (donutStageId: string) => canAccessReviewsTrackerDonut(perms, donutStageId),
      canPastReviews: () => canAccessReviewsPastReviews(perms),
      canReviewCycles: () => canAccessReviewsReviewCycles(perms),
    }),
    [perms]
  );
}

import { ALL_LOCATIONS_ID } from '../store/slices/location.slice';

export function isAllLocationsId(id: string | null | undefined): boolean {
  return id === ALL_LOCATIONS_ID;
}

const ALL_LOCATIONS_ROUTE_ALLOWLIST: readonly string[] = [
  '/dashboard/command-center',
  // Sales & Labor Detail route is singular in `client/src/router.tsx`
  '/dashboard/sales-labor-detail',
  '/dashboard/sales-trend-reports',
  '/dashboard/activity-log',
  '/dashboard/ratings-and-reviews',
  '/dashboard/kitchen-performance',
  '/dashboard/training-management',
  '/dashboard/reviews-management',
  '/dashboard/disciplinary-management',
  '/dashboard/calendar-events',
] as const;

const SINGLE_LOCATION_ONLY_ROUTES: readonly string[] = [
  '/dashboard/inventory-food-cost',
] as const;

export function isSingleLocationOnlyRoute(pathname: string): boolean {
  return SINGLE_LOCATION_ONLY_ROUTES.includes(pathname);
}

export function shouldShowAllLocationsOption(pathname: string): boolean {
  return ALL_LOCATIONS_ROUTE_ALLOWLIST.includes(pathname);
}

/** "All" is only meaningful when the user can choose among multiple locations. */
export function shouldOfferAllLocationsOption(pathname: string, locationCount: number): boolean {
  return shouldShowAllLocationsOption(pathname) && locationCount > 1;
}

const LOCATION_SELECTOR_HIDE_PATHS: readonly string[] = [
  '/dashboard/location-management',
  '/dashboard/user-management',
  '/dashboard/profile',
  '/dashboard/goal-setting',
  '/dashboard/training-settings',
  '/dashboard/review-settings',
  '/dashboard/disciplinary-settings',
  '/dashboard/events-notifications-settings',
  '/dashboard/alerts-notifications-settings',
  '/dashboard/data-sync-settings',
] as const;

const RBAC_MANAGEMENT_PATH_PREFIX = '/dashboard/rbac-management';

export function shouldHideLocationSelector(pathname: string): boolean {
  return pathname.startsWith(RBAC_MANAGEMENT_PATH_PREFIX) || LOCATION_SELECTOR_HIDE_PATHS.includes(pathname);
}


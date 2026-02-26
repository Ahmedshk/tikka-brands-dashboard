/**
 * Single source of truth for page and component permissions.
 * Used by Add/Edit Role modal and by permission enforcement (nav, route guard, component hiding).
 */

export interface PermissionComponent {
  id: string;
  label: string;
}

export interface PermissionPageConfig {
  pageId: string;
  pageLabel: string;
  components: PermissionComponent[];
}

const FULL_PAGE_ACCESS: PermissionComponent = { id: 'full-page', label: 'Full page access' };

/** All dashboard pages with their component IDs. First component is always Full page access. */
export const PERMISSION_PAGES: PermissionPageConfig[] = [
  {
    pageId: 'command-center',
    pageLabel: 'Command Center',
    components: [
      FULL_PAGE_ACCESS,
      { id: 'net-sales-kpi', label: 'Net Sales KPI' },
      { id: 'labor-cost-kpi', label: 'Labor Cost KPI' },
      { id: 'review-rating-kpi', label: 'Review Rating KPI' },
      { id: 'hourly-net-sales-chart', label: 'Hourly Net Sales Chart' },
      { id: 'labor-cost-percentage-gauge', label: 'Labor Cost Percentage Gauge' },
      { id: 'alerts-financial-labor', label: 'Alerts: Financial & Labor' },
      { id: 'alerts-inventory-supply-chain', label: 'Alerts: Inventory & Supply Chain' },
      { id: 'alerts-reputation-hr', label: 'Alerts: Reputation & HR' },
    ],
  },
  {
    pageId: 'sales-labor-detail',
    pageLabel: 'Sales & Labor Detail',
    components: [
      FULL_PAGE_ACCESS,
      { id: 'kpi-actual-total-net-sales', label: 'Actual Total Net Sales' },
      { id: 'kpi-actual-labor-cost', label: 'Actual Labor Cost' },
      { id: 'kpi-total-hours', label: 'Total Hours' },
      { id: 'kpi-sales-per-man-hour', label: 'Sales Per Man Hour' },
      { id: 'kpi-no-of-transactions', label: 'No. of Transactions' },
      { id: 'kpi-average-check', label: 'Average Check' },
      { id: 'kpi-total-discounts', label: 'Total Discounts' },
      { id: 'kpi-total-refunds', label: 'Total Refunds' },
      { id: 'hourly-breakdown', label: 'Hourly Breakdown' },
      { id: 'sources-of-sales', label: 'Sources of Sales' },
      { id: 'staff-timesheet', label: 'Staff Timesheet' },
      { id: 'daily-targets-vs-actual', label: 'Daily Targets vs Actual' },
    ],
  },
  {
    pageId: 'sales-trend-reports',
    pageLabel: 'Sales Trend Reports',
    components: [
      FULL_PAGE_ACCESS,
      { id: 'trends-chart', label: 'Trends Chart' },
      { id: 'kpis', label: 'KPIs' },
      { id: 'net-sales-by-category', label: 'Net Sales by Category' },
    ],
  },
  {
    pageId: 'inventory-food-cost',
    pageLabel: 'Inventory & Food Cost',
    components: [
      FULL_PAGE_ACCESS,
      { id: 'kpi-current-food-cost', label: 'Current Food Cost' },
      { id: 'kpi-inventory-value', label: 'Inventory Value' },
      { id: 'kpi-waste-cost', label: 'Waste Cost' },
      { id: 'kpi-pending-orders', label: 'Pending Orders' },
      { id: 'cost-of-goods-sold-gauge', label: 'Cost of Goods Sold Gauge' },
      { id: 'food-cost-variance', label: 'Food Cost Variance' },
      { id: 'order-tracker', label: 'Order Tracker' },
    ],
  },
  {
    pageId: 'training-reviews',
    pageLabel: 'Training & Reviews',
    components: [
      FULL_PAGE_ACCESS,
      { id: 'kpi-office-staff', label: 'Office Staff' },
      { id: 'kpi-reviews-due', label: 'Reviews Due' },
      { id: 'kpi-training-completion', label: 'Training Completion' },
      { id: 'staff-list', label: 'Staff List' },
      { id: 'review-tracker-chart', label: 'Review Tracker Chart' },
      { id: 'recently-completed-reviews', label: 'Recently Completed Reviews' },
      { id: 'employee-training', label: 'Employee Training' },
    ],
  },
  {
    pageId: 'disciplinary-management',
    pageLabel: 'Disciplinary Management',
    components: [FULL_PAGE_ACCESS],
  },
  {
    pageId: 'disciplinary-management-details',
    pageLabel: 'Disciplinary Management Details',
    components: [FULL_PAGE_ACCESS],
  },
  {
    pageId: 'calendar-events',
    pageLabel: 'Calendar & Events',
    components: [FULL_PAGE_ACCESS],
  },
  {
    pageId: 'user-management',
    pageLabel: 'User Management',
    components: [FULL_PAGE_ACCESS],
  },
  {
    pageId: 'rbac-management',
    pageLabel: 'RBAC Management',
    components: [FULL_PAGE_ACCESS],
  },
  {
    pageId: 'goal-setting',
    pageLabel: 'Goal Setting',
    components: [
      FULL_PAGE_ACCESS,
      { id: 'sales-goal', label: 'Sales Goal' },
      { id: 'labor-cost-pct-goal', label: 'Labor Cost % Goal' },
      { id: 'hours-goal', label: 'Hours Goal' },
      { id: 'spmh-goal', label: 'SPMH Goal' },
      { id: 'food-cost-pct-goal', label: 'Food Cost % Goal' },
    ],
  },
  {
    pageId: 'location-management',
    pageLabel: 'Location Management',
    components: [FULL_PAGE_ACCESS],
  },
];

/** All page IDs in order (for path → pageId mapping). */
export const PERMISSION_PAGE_IDS = PERMISSION_PAGES.map((p) => p.pageId);

/** Get component IDs for a page. */
export function getComponentIdsForPage(pageId: string): string[] {
  const page = PERMISSION_PAGES.find((p) => p.pageId === pageId);
  return page ? page.components.map((c) => c.id) : [];
}

/** Map dashboard path to pageId. /dashboard/disciplinary-management/:id -> disciplinary-management-details. */
export function getPageIdFromPath(path: string): string | null {
  const match = path.match(/^\/dashboard\/?(.*)$/);
  if (!match) return null;
  const segment = match[1]?.trim() || '';
  if (!segment) return 'command-center';
  const parts = segment.split('/').filter(Boolean);
  const firstSegment = parts[0];
  if (!firstSegment) return 'command-center';
  if (firstSegment === 'disciplinary-management' && parts.length > 1) {
    return 'disciplinary-management-details';
  }
  return firstSegment;
}

/** Check if permissions allow access to the given page. No permissions = allow all (backward compat). */
export function canAccessPage(
  permissions: import('../types/rbac.types').RolePermissions | undefined,
  pageId: string
): boolean {
  if (!permissions) return true;
  if (permissions.type === 'all') return true;
  if (pageId === 'no-access') return true;
  return permissions.pages?.some((p) => p.pageId === pageId) ?? false;
}

/** True if the user has access to at least one dashboard page (so we can show no-access when false). */
export function hasAccessToAnyPage(
  permissions: import('../types/rbac.types').RolePermissions | undefined
): boolean {
  if (!permissions) return true;
  if (permissions.type === 'all') return true;
  const pages = permissions.pages;
  return Array.isArray(pages) && pages.length > 0;
}

const FULL_PAGE_COMPONENT_ID = 'full-page';

/**
 * Check if permissions allow access to a specific component on a page.
 * Use to conditionally render and fetch only for allowed components.
 */
export function canAccessComponent(
  permissions: import('../types/rbac.types').RolePermissions | undefined,
  pageId: string,
  componentId: string
): boolean {
  if (!permissions) return true;
  if (permissions.type === 'all') return true;
  const pages = permissions.pages;
  if (!Array.isArray(pages)) return false;
  const entry = pages.find((p) => p.pageId === pageId);
  if (!entry) return false;
  if (entry.components == null) return true;
  if (entry.components.length === 0) return false;
  if (entry.components.includes(FULL_PAGE_COMPONENT_ID)) return true;
  return entry.components.includes(componentId);
}

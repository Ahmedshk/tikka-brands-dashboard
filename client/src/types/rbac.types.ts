/**
 * Page-level permission: which components/cards are allowed on a given page.
 * If components is undefined or empty, the role may have access to the whole page (or no access).
 */
export interface PagePermission {
  pageId: string;
  pageLabel: string;
  /** Allowed component/card IDs on this page. Omit or empty = typically all for that page. */
  components?: string[];
}

/** Either full access (all pages and components) or custom per-page permissions. */
export type RolePermissions =
  | { type: 'all' }
  | { type: 'custom'; pages: PagePermission[] };

/** Role can access all locations or a specific list of location IDs (input). */
export type RoleLocations = 'all' | string[];

/** Populated location from API (for display). */
export interface RoleLocationItem {
  _id: string;
  storeName: string;
}

/** Locations in API response: 'all' or IDs or populated list with storeName. */
export type RoleLocationsResponse = 'all' | string[] | RoleLocationItem[];

export interface RoleRow {
  id?: string;
  roleName: string;
  permissions: RolePermissions;
  description?: string;
  /** 'all', array of IDs, or populated array with storeName (from API). */
  locations?: RoleLocationsResponse;
  isSystem?: boolean;
  isActive?: boolean;
}

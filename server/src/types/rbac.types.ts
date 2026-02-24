/**
 * Server-side RBAC types. Mirror client shape for permissions.
 */

export interface PagePermission {
  pageId: string;
  pageLabel: string;
  components?: string[];
}

export type RolePermissions =
  | { type: 'all' }
  | { type: 'custom'; pages: PagePermission[] };

/** Role can access all locations or a specific list of location IDs (input). */
export type RoleLocations = 'all' | string[];

/** Locations in API response: 'all' or populated list with storeName. */
export type RoleLocationsResponse = 'all' | Array<{ _id: string; storeName: string }>;

export interface IRole {
  _id?: string;
  name: string;
  description?: string;
  permissions: RolePermissions;
  /** Input: 'all' | string[]; response: 'all' | Array<{ _id, storeName }>. */
  locations: RoleLocations | RoleLocationsResponse;
  isSystem: boolean;
  isActive: boolean;
  /** Reserved for future: notification types assigned to this role. */
  notificationTypes?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

/** System role name that cannot be deleted or duplicated. */
export const SYSTEM_ROLE_NAME = 'Owner';

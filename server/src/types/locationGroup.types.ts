/**
 * Location group types.
 *
 * A group is a *display* construct for the header location selector: it buckets
 * locations under a named, checkable header. Membership lives on the location
 * (`Location.groupIds`) so a location can belong to multiple groups and appear
 * under each of their headers. Legacy `groupId` membership is also read.
 *
 * Groups are never an identity for a selection — the client expands a group to
 * its member location ids and stores those without duplicates, so editing or
 * deleting a group cannot change what a saved selection means.
 */

export interface ILocationGroup {
  _id?: string;
  /** Unique (case-insensitive) display name shown as the dropdown header. */
  name: string;
  /** Display order (ascending) of the group headers. */
  sortOrder?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Group shape returned by `GET /api/location-groups`. */
export interface ILocationGroupListItem {
  _id: string;
  name: string;
  sortOrder: number;
  /**
   * Member location ids the requesting user is allowed to see, already
   * intersected with their allow-list and minus their removals. A group with no
   * accessible members is omitted from the response entirely.
   */
  locationIds: string[];
}

export type CreateLocationGroupData = {
  name: string;
  /** Assigned by the service (append to end); callers do not set this. */
  sortOrder?: number;
};

export type UpdateLocationGroupData = {
  name?: string;
};

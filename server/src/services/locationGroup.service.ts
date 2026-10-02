import { LocationGroupRepository } from '../repositories/locationGroup.repository.js';
import type { LocationListFilter } from '../repositories/location.repository.js';
import type {
  CreateLocationGroupData,
  UpdateLocationGroupData,
  ILocationGroupListItem,
} from '../types/locationGroup.types.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.util.js';

const DUPLICATE_KEY_CODE = 11000;

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number } | null)?.code === DUPLICATE_KEY_CODE;
}

export class LocationGroupService {
  private readonly repository: LocationGroupRepository;

  constructor(repository: LocationGroupRepository = new LocationGroupRepository()) {
    this.repository = repository;
  }

  /**
   * Groups the requesting user can actually populate, each carrying only the
   * member ids they are allowed to see. Groups with no accessible members are
   * omitted so the selector never renders an empty, uncheckable header.
   */
  async listForUser(filter?: LocationListFilter): Promise<ILocationGroupListItem[]> {
    const groups = await this.repository.findAll();
    if (groups.length === 0) return [];

    const membersByGroup = await this.repository.findMemberIdsByGroupIds(
      groups.map((g) => String(g._id)),
      filter,
    );

    const out: ILocationGroupListItem[] = [];
    for (const group of groups) {
      const locationIds = membersByGroup.get(String(group._id));
      if (!locationIds || locationIds.length === 0) continue;
      out.push({
        _id: String(group._id),
        name: group.name,
        sortOrder: group.sortOrder ?? 0,
        locationIds,
      });
    }
    return out;
  }

  /**
   * Every group with every member, for the management UI.
   *
   * Deliberately unfiltered, unlike {@link listForUser}: an admin managing
   * groups must see groups that are still empty or that they cannot personally
   * access, otherwise a freshly created group would be invisible and its
   * locations unassignable. Guarded by the `location-management` permission at
   * the route, not by per-user location access.
   */
  async listAllWithMembers(): Promise<ILocationGroupListItem[]> {
    const groups = await this.repository.findAll();
    if (groups.length === 0) return [];

    const membersByGroup = await this.repository.findMemberIdsByGroupIds(
      groups.map((g) => String(g._id)),
    );

    return groups.map((g) => ({
      _id: String(g._id),
      name: g.name,
      sortOrder: g.sortOrder ?? 0,
      // Empty rather than omitted: the management UI needs to know a group has
      // no members yet, and must not fall back to a permission-filtered list.
      locationIds: membersByGroup.get(String(g._id)) ?? [],
    }));
  }

  async getById(id: string) {
    const group = await this.repository.findById(id);
    if (!group) throw new NotFoundError('Location group not found');
    return group;
  }

  async create(data: CreateLocationGroupData) {
    const name = data.name.trim();
    if (!name) throw new BadRequestError('Group name is required');
    // Append to the end of the header order, mirroring LocationService.create.
    const sortOrder = (await this.repository.getMaxSortOrder()) + 1;
    try {
      const group = await this.repository.create({ name, sortOrder });
      return { _id: String(group._id), name: group.name, sortOrder: group.sortOrder };
    } catch (err) {
      if (isDuplicateKey(err)) {
        throw new ConflictError('A location group with this name already exists.');
      }
      throw err;
    }
  }

  async update(id: string, data: UpdateLocationGroupData) {
    const existing = await this.getById(id);
    const updateData: UpdateLocationGroupData = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestError('Group name is required');
      // Case-insensitive uniqueness is enforced by the index, but skip the
      // write entirely when the name is unchanged so a no-op rename does not
      // collide with the group's own existing row.
      if (name.toLowerCase() !== existing.name.toLowerCase()) {
        updateData.name = name;
      }
    }
    if (Object.keys(updateData).length === 0) {
      return { _id: String(existing._id), name: existing.name, sortOrder: existing.sortOrder ?? 0 };
    }
    try {
      const group = await this.repository.updateById(id, updateData);
      if (!group) throw new NotFoundError('Location group not found');
      return { _id: String(group._id), name: group.name, sortOrder: group.sortOrder ?? 0 };
    } catch (err) {
      if (isDuplicateKey(err)) {
        throw new ConflictError('A location group with this name already exists.');
      }
      throw err;
    }
  }

  /**
   * Delete a group and release its members.
   *
   * Remove this group's memberships. Locations retain their other groups, or
   * appear in Ungrouped when they no longer belong to any group.
   */
  async delete(id: string): Promise<void> {
    const group = await this.getById(id);
    const groupId = String(group._id);
    await this.repository.unassignLocations(groupId);
    await this.repository.deleteById(groupId);
  }

  async reorder(orderedIds: string[]): Promise<void> {
    const existingIds = await this.repository.findAllIds();
    if (orderedIds.length !== existingIds.length) {
      throw new BadRequestError('groupIds must include every group exactly once.');
    }
    const trimmed = orderedIds.map((id) => id.trim());
    if (new Set(trimmed).size !== trimmed.length) {
      throw new BadRequestError('groupIds must include every group exactly once.');
    }
    const existingSet = new Set(existingIds);
    for (const id of trimmed) {
      if (!existingSet.has(id)) {
        throw new BadRequestError('groupIds must include every group exactly once.');
      }
    }
    await this.repository.bulkUpdateSortOrder(trimmed);
  }

  /** Add/remove one membership, or clear all memberships with explicit null. */
  async assignLocation(locationId: string, groupId: string | null, action: 'add' | 'remove' = 'add'): Promise<void> {
    if (groupId != null) await this.getById(groupId);
    const ok = await this.repository.assignLocationToGroup(locationId, groupId, action);
    if (!ok) throw new NotFoundError('Location not found');
  }
}

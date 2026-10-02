import mongoose from 'mongoose';
import {
  LocationGroupModel,
  type LocationGroupDocument,
} from '../models/locationGroup.model.js';
import { LocationModel } from '../models/location.model.js';
import type {
  CreateLocationGroupData,
  UpdateLocationGroupData,
} from '../types/locationGroup.types.js';
import { LocationListFilter, buildListMatchQuery, toValidObjectIds } from './location.repository.js';
import { locationGroupIds, locationGroupIdsExpression } from '../utils/locationGroupMembership.util.js';

const LIST_SORT = { sortOrder: 1 as const, createdAt: -1 as const };

export class LocationGroupRepository {
  async create(data: CreateLocationGroupData): Promise<LocationGroupDocument> {
    const group = new LocationGroupModel(data);
    return await group.save();
  }

  async findById(id: string): Promise<LocationGroupDocument | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await LocationGroupModel.findById(id).lean().exec() as LocationGroupDocument | null;
  }

  async findByName(name: string): Promise<LocationGroupDocument | null> {
    return await LocationGroupModel.findOne({ name: name.trim() })
      .collation({ locale: 'en', strength: 2 })
      .lean()
      .exec() as LocationGroupDocument | null;
  }

  async findAll(): Promise<LocationGroupDocument[]> {
    return await LocationGroupModel.find().sort(LIST_SORT).lean().exec() as LocationGroupDocument[];
  }

  async getMaxSortOrder(): Promise<number> {
    const doc = await LocationGroupModel.findOne()
      .sort({ sortOrder: -1 })
      .select({ sortOrder: 1 })
      .lean()
      .exec();
    const n = doc?.sortOrder;
    return typeof n === 'number' && Number.isFinite(n) ? n : -1;
  }

  async updateById(
    id: string,
    updateData: UpdateLocationGroupData,
  ): Promise<LocationGroupDocument | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await LocationGroupModel.findByIdAndUpdate(id, updateData, { new: true })
      .lean()
      .exec() as LocationGroupDocument | null;
  }

  async deleteById(id: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(id)) return false;
    const result = await LocationGroupModel.findByIdAndDelete(id);
    return result !== null;
  }

  async bulkUpdateSortOrder(orderedIds: string[]): Promise<void> {
    if (orderedIds.length === 0) return;
    const ops = orderedIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id, index) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(id) },
          update: { $set: { sortOrder: index } },
        },
      }));
    if (ops.length === 0) return;
    await LocationGroupModel.bulkWrite(ops);
  }

  async findAllIds(): Promise<string[]> {
    const docs = await LocationGroupModel.find()
      .select({ _id: 1 })
      .sort(LIST_SORT)
      .lean()
      .exec();
    return docs.map((d) => String(d._id));
  }

  /** Remove only the deleted group's membership, preserving every other group. */
  async unassignLocations(groupId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(groupId)) return;
    const oid = new mongoose.Types.ObjectId(groupId);
    await LocationModel.updateMany(
      { $or: [{ groupIds: oid }, { groupId: oid }] },
      [
        { $set: { groupIds: { $setDifference: [locationGroupIdsExpression, [oid]] } } },
        { $unset: 'groupId' },
      ],
      { updatePipeline: true },
    ).exec();
  }

  /**
   * Add/remove one membership atomically. Explicit null clears all memberships
   * for compatibility with the original API.
   * Returns false when the location id is invalid or matches no document.
   */
  async assignLocationToGroup(
    locationId: string,
    groupId: string | null,
    action: 'add' | 'remove' = 'add',
  ): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(locationId)) return false;
    if (groupId != null && !mongoose.Types.ObjectId.isValid(groupId)) return false;
    const oid = groupId == null ? null : new mongoose.Types.ObjectId(groupId);
    const groupIds = oid == null ? [] : action === 'remove'
      ? { $setDifference: [locationGroupIdsExpression, [oid]] }
      : { $setUnion: [locationGroupIdsExpression, [oid]] };
    const result = await LocationModel.updateOne(
      { _id: new mongoose.Types.ObjectId(locationId) },
      [{ $set: { groupIds } }, { $unset: 'groupId' }],
      { updatePipeline: true },
    ).exec();
    return result.matchedCount > 0;
  }

  /**
   * Member location ids per group, in one query, optionally filtered by the
   * requesting user's access.
   *
   * Returns a `Map` keyed by group id; groups with no accessible members are
   * simply absent, which lets the caller omit them from the response rather than
   * render an empty header the user cannot fill.
   */
  async findMemberIdsByGroupIds(
    groupIds: string[],
    filter?: LocationListFilter,
  ): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    const oids = toValidObjectIds(groupIds);
    if (oids.length === 0) return out;

    // Reuse the location repository's access filter so a group's member list is
    // narrowed by exactly the same allow-list/removal rules as GET /locations.
    const accessMatch = buildListMatchQuery(filter);
    const requested = new Set(oids.map(String));
    const query: Record<string, unknown> = {
      $or: [{ groupIds: { $in: oids } }, { groupId: { $in: oids } }],
    };
    if (Object.keys(accessMatch).length > 0) {
      query.$and = [accessMatch];
    }

    const docs = (await LocationModel.find(query)
      .select({ _id: 1, groupId: 1, groupIds: 1 })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean()
      .exec()) as unknown as Array<{
        _id: mongoose.Types.ObjectId; groupId?: mongoose.Types.ObjectId; groupIds?: mongoose.Types.ObjectId[];
      }>;

    for (const doc of docs) {
      for (const key of locationGroupIds(doc)) {
        if (!requested.has(key)) continue;
        const list = out.get(key);
        if (list) list.push(String(doc._id));
        else out.set(key, [String(doc._id)]);
      }
    }
    return out;
  }
}

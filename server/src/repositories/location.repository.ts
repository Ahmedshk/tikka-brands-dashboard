import type { UpdateQuery } from 'mongoose';
import mongoose from 'mongoose';
import { LocationModel, LocationDocument } from '../models/location.model.js';
import { ILocation } from '../types/location.types.js';

/** Optional filters for GET /locations (RBAC). */
export interface LocationListFilter {
  /** When set, only these location ids (e.g. role allow-list). Empty array matches nothing. */
  allowedIds?: string[];
  /** Exclude these ids after allow-list (or from all locations if no allow-list). */
  excludeIds?: string[];
}

function toValidObjectIds(ids: string[]): mongoose.Types.ObjectId[] {
  const out: mongoose.Types.ObjectId[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (mongoose.Types.ObjectId.isValid(id)) {
      out.push(new mongoose.Types.ObjectId(id));
    }
  }
  return out;
}

function buildListMatchQuery(filter?: LocationListFilter): Record<string, unknown> {
  if (!filter) return {};
  const hasAllowed = filter.allowedIds != null;
  const hasExclude =
    filter.excludeIds != null && filter.excludeIds.length > 0;

  if (!hasAllowed && !hasExclude) return {};

  const parts: Record<string, unknown>[] = [];

  if (hasAllowed) {
    const oids = toValidObjectIds(filter.allowedIds!);
    parts.push({ _id: { $in: oids } });
  }
  if (hasExclude) {
    const oids = toValidObjectIds(filter.excludeIds!);
    if (oids.length > 0) {
      parts.push({ _id: { $nin: oids } });
    }
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0]!;
  return { $and: parts };
}

const LIST_SORT = { sortOrder: 1 as const, createdAt: -1 as const };

const LIST_PROJECTION = {
  storeName: 1,
  address: 1,
  timezone: 1,
  businessStartTime: 1,
  logoId: 1,
  createdAt: 1,
} as const;

export class LocationRepository {
  async create(data: Omit<ILocation, '_id' | 'createdAt' | 'updatedAt'>): Promise<LocationDocument> {
    const location = new LocationModel(data);
    return await location.save();
  }

  async findById(id: string): Promise<LocationDocument | null> {
    return await LocationModel.findById(id).lean().exec() as LocationDocument | null;
  }

  async findAll(): Promise<LocationDocument[]> {
    return await LocationModel.find().sort(LIST_SORT).lean().exec() as LocationDocument[];
  }

  async findPaginated(skip: number, limit: number): Promise<LocationDocument[]> {
    return await LocationModel.find().select(LIST_PROJECTION).sort(LIST_SORT).skip(skip).limit(limit).lean().exec() as LocationDocument[];
  }

  async findPaginatedWithFilter(
    skip: number,
    limit: number,
    filter?: LocationListFilter,
  ): Promise<LocationDocument[]> {
    const q = buildListMatchQuery(filter);
    return await LocationModel.find(q)
      .select(LIST_PROJECTION)
      .sort(LIST_SORT)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec() as LocationDocument[];
  }

  async count(): Promise<number> {
    return await LocationModel.countDocuments();
  }

  async countWithFilter(filter?: LocationListFilter): Promise<number> {
    const q = buildListMatchQuery(filter);
    return await LocationModel.countDocuments(q);
  }

  async getMaxSortOrder(): Promise<number> {
    const doc = await LocationModel.findOne()
      .sort({ sortOrder: -1 })
      .select({ sortOrder: 1 })
      .lean()
      .exec();
    const n = doc?.sortOrder;
    return typeof n === 'number' && Number.isFinite(n) ? n : -1;
  }

  async findAllIds(): Promise<string[]> {
    const docs = await LocationModel.find()
      .select({ _id: 1 })
      .sort(LIST_SORT)
      .lean()
      .exec();
    return docs.map((d) => String(d._id));
  }

  async bulkUpdateSortOrder(orderedIds: string[]): Promise<void> {
    if (orderedIds.length === 0) return;
    const ops = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(id) },
        update: { $set: { sortOrder: index } },
      },
    }));
    await LocationModel.bulkWrite(ops);
  }
  async updateById(
    id: string,
    updateData: UpdateQuery<LocationDocument> | Partial<Omit<ILocation, '_id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<LocationDocument | null> {
    return await LocationModel.findByIdAndUpdate(id, updateData, { new: true }).lean().exec() as LocationDocument | null;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await LocationModel.findByIdAndDelete(id);
    return result !== null;
  }

  async findBySquareLocationId(squareLocationId: string): Promise<LocationDocument | null> {
    return await LocationModel.findOne({ squareLocationId: squareLocationId.trim() })
      .lean()
      .exec() as LocationDocument | null;
  }

  async findBySquareMerchantId(squareMerchantId: string): Promise<LocationDocument | null> {
    return await LocationModel.findOne({ squareMerchantId: squareMerchantId.trim() })
      .lean()
      .exec() as LocationDocument | null;
  }

  async findByMarketManBuyerGuid(buyerGuid: string): Promise<LocationDocument | null> {
    return await LocationModel.findOne({ marketManBuyerGuid: buyerGuid.trim() })
      .lean()
      .exec() as LocationDocument | null;
  }
}

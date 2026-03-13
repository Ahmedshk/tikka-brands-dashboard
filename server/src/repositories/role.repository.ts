import { Types } from "mongoose";
import { RoleModel, RoleDocument } from "../models/role.model.js";
import { IRole, RoleLocations, RoleLocationsResponse } from "../types/rbac.types.js";

function normalizeToLocationIds(locations: RoleLocations | RoleLocationsResponse | undefined): string[] | "all" {
  if (locations == null || locations === "all") return "all";
  if (!Array.isArray(locations)) return "all";
  return locations.map((item) => (typeof item === "string" ? item : item._id));
}

function toLocationFields(locations: RoleLocations | RoleLocationsResponse | undefined): {
  locationAccess: "all" | "specific";
  locationIds: Types.ObjectId[];
} {
  const normalized = normalizeToLocationIds(locations);
  if (normalized === "all") {
    return { locationAccess: "all", locationIds: [] };
  }
  const ids = normalized.map((id) => new Types.ObjectId(id));
  return { locationAccess: "specific", locationIds: ids };
}

export class RoleRepository {
  async create(data: Omit<IRole, "_id" | "createdAt" | "updatedAt">): Promise<RoleDocument> {
    const { locations, reportsTo, reportsToRole: _, ...rest } = data;
    const { locationAccess, locationIds } = toLocationFields(locations);
    const role = new RoleModel({
      ...rest,
      locationAccess,
      locationIds,
      reportsTo: reportsTo ? new Types.ObjectId(reportsTo) : null,
    });
    return await role.save();
  }

  async findById(id: string): Promise<RoleDocument | null> {
    return await RoleModel.findById(id)
      .populate("locationIds", "storeName")
      .populate("reportsTo", "name")
      .lean()
      .exec() as RoleDocument | null;
  }

  async findByName(name: string): Promise<RoleDocument | null> {
    return await RoleModel.findOne({ name: name.trim() })
      .populate("locationIds", "storeName")
      .populate("reportsTo", "name")
      .lean()
      .exec() as RoleDocument | null;
  }

  async findAll(activeOnly = false): Promise<RoleDocument[]> {
    const query = activeOnly ? { isActive: true } : {};
    return await RoleModel.find(query)
      .sort({ createdAt: -1 })
      .populate("locationIds", "storeName")
      .populate("reportsTo", "name")
      .lean()
      .exec() as RoleDocument[];
  }

  async findByReportsTo(parentId: string): Promise<RoleDocument[]> {
    return await RoleModel.find({ reportsTo: new Types.ObjectId(parentId) })
      .populate("locationIds", "storeName")
      .populate("reportsTo", "name")
      .lean()
      .exec() as RoleDocument[];
  }

  async updateById(
    id: string,
    data: Partial<Omit<IRole, "_id" | "isSystem">>
  ): Promise<RoleDocument | null> {
    const { isSystem: _, locations, reportsTo, reportsToRole: _r, ...rest } = data as Partial<IRole>;
    const update: Record<string, unknown> = { ...rest };
    if (locations !== undefined) {
      const { locationAccess, locationIds } = toLocationFields(locations);
      update.locationAccess = locationAccess;
      update.locationIds = locationIds;
    }
    if (reportsTo !== undefined) {
      update.reportsTo = reportsTo ? new Types.ObjectId(reportsTo) : null;
    }
    return await RoleModel.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    })
      .populate("locationIds", "storeName")
      .populate("reportsTo", "name")
      .lean()
      .exec() as RoleDocument | null;
  }

  async bulkUpdateReportsTo(
    mappings: Array<{ roleId: string; reportsTo: string | null }>
  ): Promise<void> {
    if (mappings.length === 0) return;
    const ops = mappings.map((m) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(m.roleId) },
        update: {
          $set: { reportsTo: m.reportsTo ? new Types.ObjectId(m.reportsTo) : null },
        },
      },
    }));
    await RoleModel.bulkWrite(ops);
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await RoleModel.findByIdAndDelete(id);
    return result !== null;
  }

  async setActive(id: string, isActive: boolean): Promise<RoleDocument | null> {
    return await RoleModel.findByIdAndUpdate(id, { isActive }, { new: true }).lean().exec() as RoleDocument | null;
  }
}

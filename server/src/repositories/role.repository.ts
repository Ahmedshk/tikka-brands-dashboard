import { Types } from "mongoose";
import { RoleModel, RoleDocument } from "../models/role.model.js";
import { IRole, RoleLocations } from "../types/rbac.types.js";

function toLocationFields(locations: RoleLocations | undefined): {
  locationAccess: "all" | "specific";
  locationIds: Types.ObjectId[];
} {
  if (locations == null || locations === "all") {
    return { locationAccess: "all", locationIds: [] };
  }
  const ids = Array.isArray(locations)
    ? locations.map((id) => (typeof id === "string" ? new Types.ObjectId(id) : id))
    : [];
  return { locationAccess: "specific", locationIds: ids };
}

export class RoleRepository {
  async create(data: Omit<IRole, "_id" | "createdAt" | "updatedAt">): Promise<RoleDocument> {
    const { locations, ...rest } = data;
    const { locationAccess, locationIds } = toLocationFields(locations);
    const role = new RoleModel({ ...rest, locationAccess, locationIds });
    return await role.save();
  }

  async findById(id: string): Promise<RoleDocument | null> {
    return await RoleModel.findById(id)
      .populate("locationIds", "storeName")
      .lean()
      .exec() as RoleDocument | null;
  }

  async findByName(name: string): Promise<RoleDocument | null> {
    return await RoleModel.findOne({ name: name.trim() })
      .populate("locationIds", "storeName")
      .lean()
      .exec() as RoleDocument | null;
  }

  async findAll(activeOnly = false): Promise<RoleDocument[]> {
    const query = activeOnly ? { isActive: true } : {};
    return await RoleModel.find(query)
      .sort({ createdAt: -1 })
      .populate("locationIds", "storeName")
      .lean()
      .exec() as RoleDocument[];
  }

  async updateById(
    id: string,
    data: Partial<Omit<IRole, "_id" | "isSystem">>
  ): Promise<RoleDocument | null> {
    const { isSystem: _, locations, ...rest } = data as Partial<IRole>;
    const update: Record<string, unknown> = { ...rest };
    if (locations !== undefined) {
      const { locationAccess, locationIds } = toLocationFields(locations);
      update.locationAccess = locationAccess;
      update.locationIds = locationIds;
    }
    return await RoleModel.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    })
      .populate("locationIds", "storeName")
      .lean()
      .exec() as RoleDocument | null;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await RoleModel.findByIdAndDelete(id);
    return result !== null;
  }

  async setActive(id: string, isActive: boolean): Promise<RoleDocument | null> {
    return await RoleModel.findByIdAndUpdate(id, { isActive }, { new: true });
  }
}

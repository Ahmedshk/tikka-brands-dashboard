import { RoleRepository } from "../repositories/role.repository.js";
import { UserRepository } from "../repositories/user.repository.js";
import {
  IRole,
  RolePermissions,
  RoleLocations,
  RoleLocationsResponse,
  SYSTEM_ROLE_NAME,
} from "../types/rbac.types.js";
import { ConflictError, ForbiddenError } from "../utils/errors.util.js";

export class RoleService {
  private readonly roleRepository: RoleRepository;
  private readonly userRepository: UserRepository;

  constructor() {
    this.roleRepository = new RoleRepository();
    this.userRepository = new UserRepository();
  }

  async list(activeOnly = false): Promise<IRole[]> {
    const docs = await this.roleRepository.findAll(activeOnly);
    return docs.map((d) => this.toRole(d));
  }

  async getById(id: string): Promise<IRole | null> {
    const doc = await this.roleRepository.findById(id);
    return doc ? this.toRole(doc) : null;
  }

  async create(data: {
    name: string;
    description?: string;
    permissions: RolePermissions;
    locations?: RoleLocations;
  }): Promise<IRole> {
    const trimmedName = data.name.trim();
    if (trimmedName === SYSTEM_ROLE_NAME) {
      throw new ForbiddenError(`Role name "${SYSTEM_ROLE_NAME}" is reserved for the system role.`);
    }
    const existing = await this.roleRepository.findByName(trimmedName);
    if (existing) {
      throw new ConflictError(`A role with name "${trimmedName}" already exists.`);
    }
    const locations: RoleLocations = data.locations ?? "all";
    const doc = await this.roleRepository.create({
      name: trimmedName,
      description: data.description?.trim() ?? "",
      permissions: data.permissions,
      locations,
      isSystem: false,
      isActive: true,
    });
    const populated = await this.roleRepository.findById(doc._id.toString());
    return populated ? this.toRole(populated) : this.toRole(doc);
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      permissions?: RolePermissions;
      locations?: RoleLocations;
    }
  ): Promise<IRole | null> {
    const role = await this.roleRepository.findById(id);
    if (!role) return null;
    if (role.isSystem) {
      throw new ForbiddenError("System role cannot be modified.");
    }
    if (data.name !== undefined) {
      const trimmed = data.name.trim();
      if (trimmed === SYSTEM_ROLE_NAME) {
        throw new ForbiddenError(`Role name "${SYSTEM_ROLE_NAME}" is reserved.`);
      }
      const existing = await this.roleRepository.findByName(trimmed);
      if (existing && existing._id.toString() !== id) {
        throw new ConflictError(`A role with name "${trimmed}" already exists.`);
      }
      data.name = trimmed;
    }
    const updated = await this.roleRepository.updateById(id, data);
    return updated ? this.toRole(updated) : null;
  }

  /** Returns { deleted: true } if hard-deleted, { deactivated: true } if soft-deleted. */
  async delete(id: string): Promise<{ deleted: boolean; deactivated?: boolean }> {
    const role = await this.roleRepository.findById(id);
    if (!role) {
      return { deleted: false };
    }
    if (role.isSystem) {
      throw new ForbiddenError("System role cannot be deleted.");
    }
    const userCount = await this.countUsersWithRole(id);
    if (userCount > 0) {
      await this.roleRepository.setActive(id, false);
      return { deleted: false, deactivated: true };
    }
    await this.roleRepository.deleteById(id);
    return { deleted: true };
  }

  /** Count users that have this role (by role name for now; by roleId after User has roleId). */
  async countUsersWithRole(roleId: string): Promise<number> {
    const role = await this.roleRepository.findById(roleId);
    if (!role) return 0;
    const users = await this.userRepository.findByRole(role.name);
    return users.length;
  }

  async ensureOwnerRoleExists(): Promise<{ roleId: string }> {
    let owner = await this.roleRepository.findByName(SYSTEM_ROLE_NAME);
    if (!owner) {
      owner = await this.roleRepository.create({
        name: SYSTEM_ROLE_NAME,
        description: "Full access to all pages and features.",
        permissions: { type: "all" },
        locations: "all",
        isSystem: true,
        isActive: true,
      });
    } else if (owner.locationAccess !== "all") {
      await this.roleRepository.updateById(owner._id.toString(), { locations: "all" });
    }
    return { roleId: owner._id.toString() };
  }

  private toRole(doc: {
    _id: { toString(): string };
    name: string;
    description?: string;
    permissions: RolePermissions;
    locationAccess: "all" | "specific";
    locationIds?: Array<
      | { _id: { toString(): string }; storeName?: string }
      | { toString(): string }
    >;
    isSystem: boolean;
    isActive: boolean;
  }): IRole {
    let locations: RoleLocationsResponse = "all";
    if ((doc.locationAccess ?? "all") === "specific" && Array.isArray(doc.locationIds)) {
      locations = doc.locationIds
        .filter((l) => l != null)
        .map((l) => {
          if (typeof l === "object" && l !== null && "storeName" in l) {
            return {
              _id: (l as { _id: { toString(): string }; storeName: string })._id.toString(),
              storeName: (l as { storeName: string }).storeName ?? "",
            };
          }
          let id: string;
          if (typeof (l as { toString?: () => string }).toString === "function") {
            id = (l as { toString(): string }).toString();
          } else if (typeof l === "object" && l !== null && "_id" in l) {
            id = String((l as { _id: unknown })._id);
          } else {
            id = String(l);
          }
          return { _id: id, storeName: "" };
        });
    }
    return {
      _id: doc._id.toString(),
      name: doc.name,
      description: doc.description ?? "",
      permissions: doc.permissions,
      locations,
      isSystem: doc.isSystem,
      isActive: doc.isActive,
    };
  }
}

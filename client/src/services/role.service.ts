import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";
import { ApiResponse } from "../types";
import type { RoleRow, RolePermissions, RoleLocations, RoleLocationsResponse } from "../types/rbac.types";

const BASE = API_ENDPOINTS.ROLES;

/** API role shape (server returns name, _id, permissions, locations populated with storeName, etc.) */
interface ApiRole {
  _id: string;
  name: string;
  description?: string;
  permissions: RolePermissions;
  locations?: RoleLocations | RoleLocationsResponse;
  isSystem: boolean;
  isActive: boolean;
  reportsTo?: string | null;
  reportsToRole?: { _id: string; name: string } | null;
}

function toRoleRow(r: ApiRole): RoleRow {
  return {
    id: r._id,
    roleName: r.name,
    permissions: r.permissions,
    description: r.description,
    locations: r.locations ?? "all",
    isSystem: r.isSystem,
    isActive: r.isActive,
    reportsTo: r.reportsTo ?? null,
    reportsToRoleName: r.reportsToRole?.name ?? null,
  };
}

export const roleService = {
  async list(activeOnly = false): Promise<RoleRow[]> {
    const res = await api.get<ApiResponse<{ roles: ApiRole[] }>>(BASE, {
      params: activeOnly ? { activeOnly: "true" } : undefined,
    });
    if (!res.data.success || !res.data.data?.roles) {
      throw new Error(res.data.message ?? "Failed to fetch roles");
    }
    return res.data.data.roles.map(toRoleRow);
  },

  async getById(id: string): Promise<RoleRow | null> {
    const res = await api.get<ApiResponse<{ role: ApiRole }>>(`${BASE}/${id}`);
    if (!res.data.success || !res.data.data?.role) {
      return null;
    }
    return toRoleRow(res.data.data.role);
  },

  async create(payload: {
    name: string;
    description?: string;
    permissions: RolePermissions;
    locations?: RoleLocations;
    reportsTo?: string | null;
  }): Promise<RoleRow> {
    const res = await api.post<ApiResponse<{ role: ApiRole }>>(BASE, payload);
    if (!res.data.success || !res.data.data?.role) {
      throw new Error(res.data.message ?? "Failed to create role");
    }
    return toRoleRow(res.data.data.role);
  },

  async update(
    id: string,
    payload: {
      name?: string;
      description?: string;
      permissions?: RolePermissions;
      locations?: RoleLocations;
      reportsTo?: string | null;
    }
  ): Promise<RoleRow> {
    const res = await api.put<ApiResponse<{ role: ApiRole }>>(`${BASE}/${id}`, payload);
    if (!res.data.success || !res.data.data?.role) {
      throw new Error(res.data.message ?? "Failed to update role");
    }
    return toRoleRow(res.data.data.role);
  },

  async delete(id: string): Promise<{ deleted: boolean; deactivated?: boolean }> {
    const res = await api.delete<
      ApiResponse<{ deleted: boolean; deactivated?: boolean }>
    >(`${BASE}/${id}`);
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to delete role");
    }
    return res.data.data;
  },

  async saveHierarchy(
    mappings: Array<{ roleId: string; reportsTo: string | null }>
  ): Promise<RoleRow[]> {
    const res = await api.put<ApiResponse<{ roles: ApiRole[] }>>(
      `${BASE}/hierarchy`,
      { mappings }
    );
    if (!res.data.success || !res.data.data?.roles) {
      throw new Error(res.data.message ?? "Failed to save hierarchy");
    }
    return res.data.data.roles.map(toRoleRow);
  },
};

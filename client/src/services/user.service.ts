import api from './api.service';
import { API_ENDPOINTS } from '../utils/constants';
import { ApiResponse } from '../types';
import type { UserRow } from '../types/userManagement.types';
import type { RolePermissions } from '../types/rbac.types';

const BASE = API_ENDPOINTS.USERS;

interface ApiUser {
  _id?: string;
  _doc?: Record<string, unknown>;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  squareId?: string;
  homebaseData?: import('../types/userManagement.types').HomebaseData | null;
  role?: string | null;
  roleId?: string | null;
  status?: 'pending' | 'active';
  isActive?: boolean;
  isTerminated?: boolean;
  invitationSentAt?: string | null;
  profileImageUrl?: string | null;
  permissionOverrides?: RolePermissions | null;
  locationOverrides?: string[] | null;
  permissionRemovals?: RolePermissions | null;
  locationRemovals?: string[] | null;
  startDate?: string | null;
  hasActiveReviewCycle?: boolean;
  createdAt?: string | null;
}

/** Use plain fields; if API sent Mongoose doc, data may be in _doc. */
function pickUser(u: ApiUser): ApiUser {
  if (u && typeof u._doc === 'object' && u._doc !== null) {
    const d = u._doc;
    return {
      _id: typeof d._id === 'string' ? d._id : (d._id as { toString?: () => string })?.toString?.(),
      firstName: d.firstName as string,
      lastName: d.lastName as string,
      email: d.email as string,
      phone: d.phone as string | undefined,
      squareId: d.squareId as string | undefined,
      homebaseData: d.homebaseData as import('../types/userManagement.types').HomebaseData | null | undefined,
      role: (d.role as string | null) ?? null,
      roleId: (d.roleId as string | null) ?? null,
      status: d.status as 'pending' | 'active' | undefined,
      isActive: d.isActive as boolean | undefined,
      isTerminated: d.isTerminated === true,
      invitationSentAt: d.invitationSentAt as string | null | undefined,
      profileImageUrl: d.profileImageUrl as string | null | undefined,
      permissionOverrides: (d.permissionOverrides as RolePermissions | null | undefined) ?? undefined,
      locationOverrides: (d.locationOverrides as string[] | null | undefined) ?? undefined,
      permissionRemovals: (d.permissionRemovals as RolePermissions | null | undefined) ?? undefined,
      locationRemovals: (d.locationRemovals as string[] | null | undefined) ?? undefined,
      startDate: (d.startDate as string | null | undefined) ?? undefined,
      hasActiveReviewCycle: d.hasActiveReviewCycle === true,
      createdAt: (d.createdAt as string | null | undefined) ?? undefined,
    };
  }
  return u;
}

function toUserRow(u: ApiUser): UserRow {
  const d = pickUser(u);
  const id = d._id ?? '';
  const firstName = d.firstName ?? '';
  const lastName = d.lastName ?? '';
  const email = d.email ?? '';
  const name = [firstName, lastName].filter(Boolean).join(' ').trim() || email;
  const isActive = d.isActive !== false;
  const statusVal = d.status ?? 'active';
  const isTerminated = d.isTerminated === true;
  let status: 'Suspended' | 'Pending' | 'Active' | 'Terminated';
  if (isTerminated) {
    status = 'Terminated';
  } else if (!isActive) {
    status = 'Suspended';
  } else if (statusVal === 'pending') {
    status = 'Pending';
  } else {
    status = 'Active';
  }
  return {
    _id: id,
    firstName,
    lastName,
    name,
    email,
    phone: d.phone,
    squareId: d.squareId,
    homebaseData: d.homebaseData ?? null,
    role: d.role ?? null,
    roleId: d.roleId ?? null,
    status,
    isActive,
    isTerminated,
    invitationSentAt: d.invitationSentAt ?? null,
    profileImageUrl: d.profileImageUrl ?? null,
    permissionOverrides: d.permissionOverrides ?? null,
    locationOverrides: d.locationOverrides ?? null,
    permissionRemovals: d.permissionRemovals ?? null,
    locationRemovals: d.locationRemovals ?? null,
    startDate: d.startDate ?? null,
    hasActiveReviewCycle: d.hasActiveReviewCycle === true,
    createdAt: d.createdAt ?? null,
  };
}

export interface ListUsersParams {
  search?: string;
  roleId?: string;
  roleIds?: string[];
  locationId?: string;
  excludeAssignedTrainingId?: string;
  showArchived?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListUsersPagination {
  totalItems: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

export interface ListUsersResult {
  users: UserRow[];
  pagination: ListUsersPagination;
}

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  squareId?: string;
  homebaseData?: import('../types/userManagement.types').HomebaseData | null;
  roleId?: string | null;
  invite?: boolean;
  profileImagePublicId?: string | null;
  startDate?: string | null;
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  squareId?: string;
  homebaseData?: import('../types/userManagement.types').HomebaseData | null;
  roleId?: string | null;
  isActive?: boolean;
  profileImagePublicId?: string | null;
  permissionOverrides?: RolePermissions | null;
  locationOverrides?: string[] | null;
  permissionRemovals?: RolePermissions | null;
  locationRemovals?: string[] | null;
  startDate?: string | null;
}

export interface SyncFromSquareResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface SyncFromHomebaseResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export const userService = {
  async listUsers(params?: ListUsersParams): Promise<ListUsersResult> {
    const res = await api.get<
      ApiResponse<{
        users: ApiUser[];
        pagination: { totalItems: number; totalPages: number; page: number; pageSize: number };
      }>
    >(BASE, {
      params: {
        ...params,
        roleIds: params?.roleIds?.join(','),
      },
    });
    if (!res.data.success || !res.data.data?.users) {
      throw new Error(res.data.message ?? 'Failed to fetch users');
    }
    const { users: apiUsers, pagination } = res.data.data;
    return {
      users: apiUsers.map(toUserRow),
      pagination: {
        totalItems: pagination.totalItems,
        totalPages: pagination.totalPages,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
    };
  },

  async createUser(payload: CreateUserPayload): Promise<UserRow> {
    const res = await api.post<ApiResponse<{ user: ApiUser }>>(BASE, payload);
    if (!res.data.success || !res.data.data?.user) {
      throw new Error(res.data.message ?? 'Failed to create user');
    }
    return toUserRow(res.data.data.user);
  },

  async updateUser(userId: string, payload: UpdateUserPayload): Promise<UserRow> {
    const res = await api.put<ApiResponse<{ user: ApiUser }>>(`${BASE}/${userId}`, payload);
    if (!res.data.success || !res.data.data?.user) {
      throw new Error(res.data.message ?? 'Failed to update user');
    }
    return toUserRow(res.data.data.user);
  },

  async deleteUser(userId: string): Promise<void> {
    const res = await api.delete<ApiResponse<{ deleted: boolean }>>(`${BASE}/${userId}`);
    if (!res.data.success) {
      throw new Error(res.data.message ?? 'Failed to delete user');
    }
  },

  async terminateUser(userId: string): Promise<UserRow> {
    const res = await api.post<ApiResponse<{ user: ApiUser }>>(`${BASE}/${userId}/terminate`);
    if (!res.data.success || !res.data.data?.user) {
      throw new Error(res.data.message ?? 'Failed to terminate user');
    }
    return toUserRow(res.data.data.user);
  },

  async resendInvite(userId: string): Promise<UserRow> {
    const res = await api.post<ApiResponse<{ user: ApiUser }>>(`${BASE}/${userId}/resend-invite`);
    if (!res.data.success || !res.data.data?.user) {
      throw new Error(res.data.message ?? 'Failed to resend invitation');
    }
    return toUserRow(res.data.data.user);
  },

  async syncFromSquare(locationId: string): Promise<SyncFromSquareResult> {
    const res = await api.post<ApiResponse<SyncFromSquareResult>>(`${BASE}/sync-square`, {
      locationId,
    });
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? 'Failed to sync from Square');
    }
    return res.data.data;
  },

  async syncFromHomebase(locationId: string): Promise<SyncFromHomebaseResult> {
    const res = await api.post<ApiResponse<SyncFromHomebaseResult>>(`${BASE}/sync-homebase`, {
      locationId,
    });
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? 'Failed to sync from Homebase');
    }
    return res.data.data;
  },

  async uploadProfileImage(file: File): Promise<{ profileImagePublicId: string }> {
    const form = new FormData();
    form.append('image', file);
    const res = await api.post<ApiResponse<{ profileImagePublicId: string }>>(
      `${BASE}/upload-profile-image`,
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    if (!res.data.success || !res.data.data?.profileImagePublicId) {
      throw new Error(res.data.message ?? 'Failed to upload profile image');
    }
    return { profileImagePublicId: res.data.data.profileImagePublicId };
  },
};

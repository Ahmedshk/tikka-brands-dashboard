import api from './api.service';
import { API_ENDPOINTS } from '../utils/constants';
import type { ApiResponse } from '../types';

const BASE = API_ENDPOINTS.PROFILE;

export interface ProfileUserDto {
  _id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  role?: string | null;
  roleId?: string | null;
  status?: string;
  isActive?: boolean;
  profileImagePublicId?: string | null;
  profileImageUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function getProfile(): Promise<ProfileUserDto> {
  const res = await api.get<ApiResponse<{ user: ProfileUserDto }>>(BASE);
  if (!res.data.success || !res.data.data?.user) {
    throw new Error(res.data.message || 'Failed to load profile');
  }
  return res.data.data.user;
}

export async function uploadProfileImage(file: File): Promise<{ profileImagePublicId: string }> {
  const form = new FormData();
  form.append('image', file);
  const res = await api.post<ApiResponse<{ profileImagePublicId: string }>>(
    `${BASE}/upload-image`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  if (!res.data.success || !res.data.data?.profileImagePublicId) {
    throw new Error(res.data.message || 'Upload failed');
  }
  return { profileImagePublicId: res.data.data.profileImagePublicId };
}

export async function putProfileImagePublicId(
  profileImagePublicId: string | null,
): Promise<ProfileUserDto> {
  const res = await api.put<ApiResponse<{ user: ProfileUserDto }>>(BASE, {
    profileImagePublicId,
  });
  if (!res.data.success || !res.data.data?.user) {
    throw new Error(res.data.message || 'Failed to update profile');
  }
  return res.data.data.user;
}

export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  const res = await api.post<ApiResponse>(`${BASE}/change-password`, payload, {
    skipGlobalErrorToast: true,
  });
  if (!res.data.success) {
    throw new Error(res.data.message || 'Failed to change password');
  }
}

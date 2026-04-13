import api from './api.service';
import { API_ENDPOINTS } from '../utils/constants';
import { ApiResponse } from '../types';
import type { Logo } from '../types';

const BASE = API_ENDPOINTS.LOGOS;

export const logoService = {
  async create(file: File, name?: string): Promise<Logo> {
    const fd = new FormData();
    fd.append('logo', file);
    if (name) fd.append('name', name);
    const res = await api.post<ApiResponse<{ logo: Logo }>>(BASE, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (!res.data.success || !res.data.data?.logo) {
      throw new Error(res.data.message ?? 'Failed to create logo');
    }
    return res.data.data.logo;
  },

  async getList(): Promise<Logo[]> {
    const res = await api.get<ApiResponse<{ logos: Logo[] }>>(BASE);
    if (!res.data.success || !res.data.data?.logos) {
      throw new Error(res.data.message ?? 'Failed to fetch logos');
    }
    return res.data.data.logos;
  },

  async getById(id: string): Promise<Logo> {
    const res = await api.get<ApiResponse<{ logo: Logo }>>(`${BASE}/${id}`);
    if (!res.data.success || !res.data.data?.logo) {
      throw new Error(res.data.message ?? 'Failed to fetch logo');
    }
    return res.data.data.logo;
  },
};

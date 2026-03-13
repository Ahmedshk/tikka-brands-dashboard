import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";
import { ApiResponse } from "../types";
import type { Location, LocationListItem } from "../types";

const BASE = API_ENDPOINTS.LOCATIONS;

export interface LocationsPaginatedResponse {
  locations: LocationListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const locationService = {
  async getAll(options?: { signal?: AbortSignal }): Promise<LocationListItem[]> {
    const res = await api.get<
      ApiResponse<{
        locations: LocationListItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>
    >(`${BASE}?page=1&limit=500`, { signal: options?.signal });
    if (!res.data.success || !res.data.data?.locations) {
      throw new Error(res.data.message ?? "Failed to fetch locations");
    }
    return res.data.data.locations;
  },

  async getPaginated(
    page: number,
    limit: number
  ): Promise<LocationsPaginatedResponse> {
    const res = await api.get<
      ApiResponse<{
        locations: LocationListItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>
    >(BASE, {
      params: { page, limit },
    });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.message ?? "Failed to fetch locations");
    }
    const { locations, total, totalPages } = res.data.data;
    return {
      locations: locations ?? [],
      total: total ?? 0,
      page: res.data.data.page ?? page,
      limit: res.data.data.limit ?? limit,
      totalPages: totalPages ?? 1,
    };
  },

  async getById(id: string): Promise<Location> {
    const res = await api.get<ApiResponse<{ location: Location }>>(
      `${BASE}/${id}`
    );
    if (!res.data.success || !res.data.data?.location) {
      throw new Error(res.data.message ?? "Failed to fetch location");
    }
    return res.data.data.location;
  },

  async create(payload: {
    storeName: string;
    address: string;
    squareLocationId: string;
    homebaseLocationId: string;
    timezone: string;
    businessStartTime: string;
    squareAccessToken: string;
    homebaseApiKey: string;
    logoId?: string | null;
    marketManBuyerGuid?: string;
  }): Promise<Location> {
    const res = await api.post<ApiResponse<{ location: Location }>>(
      BASE,
      payload
    );
    if (!res.data.success || !res.data.data?.location) {
      throw new Error(res.data.message ?? "Failed to create location");
    }
    return res.data.data.location;
  },

  async update(
    id: string,
    payload: Partial<{
      storeName: string;
      address: string;
      squareLocationId: string;
      homebaseLocationId: string;
      timezone: string;
      businessStartTime: string;
    }> & {
      squareAccessToken?: string;
      homebaseApiKey?: string;
      logoId?: string | null;
      marketManBuyerGuid?: string | null;
    }
  ): Promise<Location> {
    const res = await api.put<ApiResponse<{ location: Location }>>(
      `${BASE}/${id}`,
      payload
    );
    if (!res.data.success || !res.data.data?.location) {
      throw new Error(res.data.message ?? "Failed to update location");
    }
    return res.data.data.location;
  },

  async delete(id: string): Promise<void> {
    const res = await api.delete<ApiResponse>(`${BASE}/${id}`);
    if (!res.data.success) {
      throw new Error(res.data.message ?? "Failed to delete location");
    }
  },
};

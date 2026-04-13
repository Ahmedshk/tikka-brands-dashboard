import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";
import { ApiResponse } from "../types";
import type { Location, LocationListItem } from "../types";

const BASE = API_ENDPOINTS.LOCATIONS;

const LIST_TTL_MS = 60_000;

let listCache: { locations: LocationListItem[]; fetchedAt: number } | null = null;
let inflightGetAll: Promise<LocationListItem[]> | null = null;
/** Bumped on bustCache so stale in-flight writes do not overwrite fresher cache. */
let listWriteGeneration = 0;

/** Clears the in-memory locations list cache (e.g. after create/delete). */
export function invalidateLocationListCache(): void {
  listCache = null;
  listWriteGeneration += 1;
}

async function fetchLocationsListFromApi(
  signal?: AbortSignal
): Promise<LocationListItem[]> {
  const res = await api.get<
    ApiResponse<{
      locations: LocationListItem[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>
  >(`${BASE}?page=1&limit=500`, { signal });
  if (!res.data.success || !res.data.data?.locations) {
    throw new Error(res.data.message ?? "Failed to fetch locations");
  }
  return res.data.data.locations;
}

export interface LocationsPaginatedResponse {
  locations: LocationListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const locationService = {
  /**
   * Full locations list (page=1, limit=500). Uses a short TTL cache and dedupes concurrent
   * requests when no `signal` is passed (shared in-flight promise, no abort).
   */
  async getAll(options?: {
    signal?: AbortSignal;
    bustCache?: boolean;
  }): Promise<LocationListItem[]> {
    if (options?.bustCache) {
      invalidateLocationListCache();
      const gen = listWriteGeneration;
      const locations = await fetchLocationsListFromApi(options.signal);
      if (gen === listWriteGeneration) {
        listCache = { locations, fetchedAt: Date.now() };
      }
      return locations;
    }
    const now = Date.now();
    if (listCache && now - listCache.fetchedAt < LIST_TTL_MS) {
      return listCache.locations;
    }
    if (options?.signal) {
      const gen = listWriteGeneration;
      const locations = await fetchLocationsListFromApi(options.signal);
      if (gen === listWriteGeneration) {
        listCache = { locations, fetchedAt: Date.now() };
      }
      return locations;
    }
    if (!inflightGetAll) {
      const gen = listWriteGeneration;
      inflightGetAll = fetchLocationsListFromApi()
        .then((locations) => {
          if (gen === listWriteGeneration) {
            listCache = { locations, fetchedAt: Date.now() };
          }
          return locations;
        })
        .catch((err) => {
          inflightGetAll = null;
          throw err;
        })
        .finally(() => {
          inflightGetAll = null;
        });
    }
    return inflightGetAll;
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
    squareWebhookSignatureKey?: string;
  }): Promise<Location> {
    const res = await api.post<ApiResponse<{ location: Location }>>(
      BASE,
      payload,
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
      squareWebhookSignatureKey?: string;
      logoId?: string | null;
      clearLogo?: boolean;
      marketManBuyerGuid?: string | null;
    }
  ): Promise<Location> {
    const { clearLogo, ...fields } = payload;
    const body = clearLogo ? { ...fields, logoId: null } : fields;

    const res = await api.put<ApiResponse<{ location: Location }>>(
      `${BASE}/${id}`,
      body,
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

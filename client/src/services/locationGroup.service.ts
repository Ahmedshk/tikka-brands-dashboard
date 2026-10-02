import api from './api.service';
import { API_ENDPOINTS } from '../utils/constants';
import { ApiResponse } from '../types';
import type { LocationGroup, LocationGroupSummary } from '../types';

const BASE = API_ENDPOINTS.LOCATION_GROUPS;

const LIST_TTL_MS = 60_000;

let listCache: { groups: LocationGroup[]; fetchedAt: number } | null = null;
let inflightGetAll: Promise<LocationGroup[]> | null = null;
/** Bumped on bustCache so a stale in-flight write cannot overwrite fresher data. */
let listWriteGeneration = 0;

/**
 * Clear the in-memory groups cache.
 *
 * Call after any group or membership mutation: the navbar buckets locations by
 * these ids, so a stale list would render a location under a group it just left.
 */
export function invalidateLocationGroupListCache(): void {
  listCache = null;
  listWriteGeneration += 1;
}

async function fetchGroupsFromApi(signal?: AbortSignal): Promise<LocationGroup[]> {
  const res = await api.get<ApiResponse<{ groups: LocationGroup[] }>>(BASE, { signal });
  if (!res.data.success || !res.data.data?.groups) {
    throw new Error(res.data.message ?? 'Failed to fetch location groups');
  }
  return res.data.data.groups;
}

export const locationGroupService = {
  /**
   * Groups with their accessible member ids, for the header selector. Uses the
   * same short TTL cache and in-flight dedupe as the locations list.
   */
  async getAll(options?: { signal?: AbortSignal; bustCache?: boolean }): Promise<LocationGroup[]> {
    const now = Date.now();
    if (!options?.bustCache && listCache && now - listCache.fetchedAt < LIST_TTL_MS) {
      return listCache.groups;
    }
    if (!options?.signal && inflightGetAll) return inflightGetAll;

    const generation = listWriteGeneration;
    const request = fetchGroupsFromApi(options?.signal)
      .then((groups) => {
        // Drop the result if a mutation invalidated the cache while in flight.
        if (generation === listWriteGeneration) {
          listCache = { groups, fetchedAt: Date.now() };
        }
        return groups;
      })
      .finally(() => {
        if (inflightGetAll === request) inflightGetAll = null;
      });

    if (!options?.signal) inflightGetAll = request;
    return request;
  },

  /**
   * Every group with all members, for the management UI.
   *
   * Hits `/management`, NOT `/`: the navbar list deliberately omits groups the
   * user has no accessible members in, so a freshly created (empty) group would
   * never appear and its locations could not be assigned.
   */
  async getAllForManagement(options?: {
    signal?: AbortSignal;
    bustCache?: boolean;
  }): Promise<LocationGroup[]> {
    const res = await api.get<ApiResponse<{ groups: LocationGroup[] }>>(
      `${BASE}/management`,
      { signal: options?.signal },
    );
    if (!res.data.success || !res.data.data?.groups) {
      throw new Error(res.data.message ?? 'Failed to fetch location groups');
    }
    return res.data.data.groups;
  },

  async create(name: string): Promise<LocationGroupSummary> {
    const res = await api.post<ApiResponse<{ group: LocationGroupSummary }>>(BASE, { name });
    if (!res.data.success || !res.data.data?.group) {
      throw new Error(res.data.message ?? 'Failed to create location group');
    }
    invalidateLocationGroupListCache();
    return res.data.data.group;
  },

  async update(id: string, name: string): Promise<LocationGroupSummary> {
    const res = await api.put<ApiResponse<{ group: LocationGroupSummary }>>(`${BASE}/${id}`, { name });
    if (!res.data.success || !res.data.data?.group) {
      throw new Error(res.data.message ?? 'Failed to update location group');
    }
    invalidateLocationGroupListCache();
    return res.data.data.group;
  },

  async delete(id: string): Promise<void> {
    const res = await api.delete<ApiResponse>(`${BASE}/${id}`);
    if (!res.data.success) {
      throw new Error(res.data.message ?? 'Failed to delete location group');
    }
    invalidateLocationGroupListCache();
  },

  async reorder(groupIds: string[]): Promise<void> {
    const res = await api.put<ApiResponse>(`${BASE}/order`, { groupIds });
    if (!res.data.success) {
      throw new Error(res.data.message ?? 'Failed to save location group order');
    }
    invalidateLocationGroupListCache();
  },

  /** Add/remove one group while preserving the location's other memberships. */
  async assignLocation(locationId: string, groupId: string, action: 'add' | 'remove' = 'add'): Promise<void> {
    const res = await api.put<ApiResponse>(`${BASE}/locations/${locationId}`, { groupId, action });
    if (!res.data.success) {
      throw new Error(res.data.message ?? 'Failed to update location group');
    }
    invalidateLocationGroupListCache();
  },
};

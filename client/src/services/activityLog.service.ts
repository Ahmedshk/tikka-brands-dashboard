import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";
import type { ApiResponse } from "../types";
import type {
  ActivityLogOrderNote,
  ActivityLogPaginationMeta,
  ActivityLogRow,
} from "../types/activityLog.types";

interface ActivityLogListResponse {
  rows: ActivityLogRow[];
  meta: ActivityLogPaginationMeta;
}

function formatDateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const activityLogService = {
  async getRows(locationId: string, date: Date): Promise<ActivityLogListResponse> {
    const params = new URLSearchParams({
      locationId,
      date: formatDateToIso(date),
    });
    const res = await api.get<
      ApiResponse<ActivityLogRow[]> & {
        meta?: ActivityLogPaginationMeta;
      }
    >(`${API_ENDPOINTS.ACTIVITY_LOG.LIST}?${params.toString()}`);

    if (!res.data.success) {
      throw new Error(res.data.message ?? "Failed to load activity log.");
    }

    const rows = Array.isArray(res.data.data) ? res.data.data : [];
    return {
      rows,
      meta: res.data.meta ?? {
        total: rows.length,
        page: 1,
        limit: rows.length,
        totalPages: 1,
      },
    };
  },

  async getOrderNote(locationId: string, squareOrderId: string): Promise<ActivityLogOrderNote> {
    const params = new URLSearchParams({ locationId });
    const res = await api.get<ApiResponse<ActivityLogOrderNote>>(
      `${API_ENDPOINTS.ACTIVITY_LOG.orderNotes(squareOrderId)}?${params.toString()}`,
    );
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.message ?? "Failed to load order note.");
    }
    return res.data.data;
  },

  async updateOrderNote(
    locationId: string,
    squareOrderId: string,
    note: string,
  ): Promise<ActivityLogOrderNote> {
    const res = await api.put<ApiResponse<ActivityLogOrderNote>>(
      API_ENDPOINTS.ACTIVITY_LOG.orderNotes(squareOrderId),
      { locationId, note },
    );
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.message ?? "Failed to save order note.");
    }
    return res.data.data;
  },
};

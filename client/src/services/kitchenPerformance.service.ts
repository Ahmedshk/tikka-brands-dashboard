import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";
import type { ApiResponse } from "../types";
import type {
  KitchenPerformanceDetails,
  KitchenPerformancePaginationMeta,
  KitchenPerformanceRow,
} from "../types/kitchenPerformance.types";

interface KitchenPerformanceListResponse {
  rows: KitchenPerformanceRow[];
  meta: KitchenPerformancePaginationMeta;
}

export function formatDateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const kitchenPerformanceService = {
  async getRows(
    locationId: string,
    date: Date,
    options: { page?: number; limit?: number } = {},
  ): Promise<KitchenPerformanceListResponse> {
    const params = new URLSearchParams({
      locationId,
      date: formatDateToIso(date),
      page: String(options.page ?? 1),
      limit: String(options.limit ?? 10),
    });
    const res = await api.get<
      ApiResponse<KitchenPerformanceRow[]> & {
        meta?: KitchenPerformancePaginationMeta;
      }
    >(`${API_ENDPOINTS.KITCHEN_PERFORMANCE.LIST}?${params.toString()}`);

    if (!res.data.success) {
      throw new Error(res.data.message ?? "Failed to load kitchen performance.");
    }

    return {
      rows: Array.isArray(res.data.data) ? res.data.data : [],
      meta: res.data.meta ?? {
        total: 0,
        page: 1,
        limit: options.limit ?? 10,
        totalPages: 1,
      },
    };
  },

  async importCsv(locationId: string, date: Date, file: File): Promise<void> {
    const form = new FormData();
    form.append("locationId", locationId);
    form.append("date", formatDateToIso(date));
    form.append("file", file);

    const res = await api.post<ApiResponse<{ importedRows: number }>>(
      API_ENDPOINTS.KITCHEN_PERFORMANCE.IMPORT,
      form,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );

    if (!res.data.success) {
      throw new Error(res.data.message ?? "Failed to import kitchen performance CSV.");
    }
  },

  async getDetails(
    locationId: string,
    date: Date,
    deviceName: string,
  ): Promise<KitchenPerformanceDetails> {
    const params = new URLSearchParams({
      locationId,
      date: formatDateToIso(date),
      deviceName,
    });
    const res = await api.get<ApiResponse<KitchenPerformanceDetails>>(
      `${API_ENDPOINTS.KITCHEN_PERFORMANCE.DETAILS}?${params.toString()}`,
    );
    if (!res.data.success || !res.data.data) {
      throw new Error(
        res.data.message ?? "Failed to load kitchen performance details.",
      );
    }
    return res.data.data;
  },
};

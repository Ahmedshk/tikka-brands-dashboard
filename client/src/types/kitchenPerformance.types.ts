export interface KitchenPerformanceRow {
  deviceName: string;
  location: string;
  completedTickets: number;
  avgCompletionTimeSeconds: number;
}

export interface KitchenPerformancePaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

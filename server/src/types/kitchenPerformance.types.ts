export interface KitchenPerformanceRowInput {
  deviceName: string;
  completedTickets: number;
  avgCompletionTimeSeconds: number;
}

export interface KitchenPerformanceRowDto extends KitchenPerformanceRowInput {
  location: string;
}

export interface KitchenPerformanceListResult {
  items: KitchenPerformanceRowDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

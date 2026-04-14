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

export interface KitchenPerformanceTicketRow {
  ticketName: string | null;
  orderSource: string | null;
  numberOfItems: number | null;
  itemsInTicket: string | null;
  timeCreated: string | null;
  timeCompleted: string | null;
  timeDue: string | null;
  timeRecalled: string | null;
  completionTimeSeconds: number | null;
}

export interface KitchenPerformanceHourlyPoint {
  hour24: number;
  label: string;
  completedTickets: number;
}

export interface KitchenPerformanceItemPerformanceRow {
  itemName: string;
  avgCompletionTimeSeconds: number | null;
  minCompletionTimeSeconds: number | null;
  maxCompletionTimeSeconds: number | null;
  totalQuantity: number;
}

export interface KitchenPerformanceTicketKpis {
  completedTickets: number;
  completedItems: number;
  avgCompletionTimeSeconds: number | null;
  recalledTickets: number;
  avgItemsPerTicket: number | null;
  ticketsPastDueTime: number;
}

export interface KitchenPerformanceDetails {
  kpis: KitchenPerformanceTicketKpis;
  hourlyCompletedTickets: KitchenPerformanceHourlyPoint[];
  ticketRows: KitchenPerformanceTicketRow[];
  itemPerformanceRows: KitchenPerformanceItemPerformanceRow[];
}

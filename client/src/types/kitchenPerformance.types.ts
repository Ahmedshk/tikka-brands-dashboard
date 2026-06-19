export interface KitchenPerformanceRow {
  deviceName: string;
  type: string;
  location: string;
  locationId?: string;
  completedTickets: number;
  avgCompletionTimeSeconds: number;
}

export interface KitchenPerformancePaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface KitchenPerformanceTicketLineItem {
  itemName: string;
  quantity: number;
  options: string[];
  orderId?: string | null;
  variation?: string | null;
}

export interface KitchenPerformanceTicketRow {
  ticketName: string | null;
  orderSource: string | null;
  numberOfItems: number | null;
  itemsInTicket: string | null;
  ticketLineItems?: KitchenPerformanceTicketLineItem[] | null;
  timeCreated: string | null;
  timeCompleted: string | null;
  timeDue: string | null;
  timeRecalled: string | null;
  completionTimeSeconds: number | null;
  isLate?: boolean | null;
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
  ticketsWithTimeDue?: number;
  ticketsLatePercent?: number | null;
}

export interface KitchenPerformanceDetails {
  kpis: KitchenPerformanceTicketKpis;
  hourlyCompletedTickets: KitchenPerformanceHourlyPoint[];
  ticketRows: KitchenPerformanceTicketRow[];
  itemPerformanceRows: KitchenPerformanceItemPerformanceRow[];
}

export interface KitchenPerformanceReportMeta {
  startDate: string;
  endDate: string;
  locationIds: string[];
  fetchedAt: string;
}

export interface KitchenPerformanceReportPayload {
  listRows: KitchenPerformanceRow[];
  meta: KitchenPerformanceReportMeta;
}

export type KitchenPerformanceTicketModifiersLookup = Record<
  string,
  Record<string, string[]>
>;

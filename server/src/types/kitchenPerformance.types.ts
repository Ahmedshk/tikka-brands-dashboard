export interface KitchenPerformanceRowInput {
  deviceName: string;
  type: string;
  completedTickets: number;
  avgCompletionTimeSeconds: number;
}

export interface KitchenPerformanceRowDto extends KitchenPerformanceRowInput {
  location: string;
  locationId?: string;
}

export interface KitchenPerformanceRawTicketInput {
  deviceName: string | null;
  ticketName: string | null;
  orderSource: string | null;
  numberOfItems: number | null;
  itemsInTicket: string | null;
  completionTimeSeconds: number | null;
  timeCreated: string | null;
  timeCompleted: string | null;
  timeDue: string | null;
  timeRecalled: string | null;
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

export interface KitchenPerformanceTicketLineItemDto {
  itemName: string;
  quantity: number;
  options: string[];
}

export interface KitchenPerformanceTicketRowDto {
  ticketName: string | null;
  orderSource: string | null;
  numberOfItems: number | null;
  itemsInTicket: string | null;
  ticketLineItems: KitchenPerformanceTicketLineItemDto[] | null;
  timeCreated: string | null;
  timeCompleted: string | null;
  timeDue: string | null;
  timeRecalled: string | null;
  completionTimeSeconds: number | null;
  isLate: boolean | null;
}

export interface KitchenPerformanceHourlyPointDto {
  hour24: number;
  label: string;
  completedTickets: number;
}

export interface KitchenPerformanceItemPerformanceRowDto {
  itemName: string;
  avgCompletionTimeSeconds: number | null;
  minCompletionTimeSeconds: number | null;
  maxCompletionTimeSeconds: number | null;
  totalQuantity: number;
}

export interface KitchenPerformanceTicketKpisDto {
  completedTickets: number;
  completedItems: number;
  avgCompletionTimeSeconds: number | null;
  recalledTickets: number;
  avgItemsPerTicket: number | null;
  ticketsPastDueTime: number;
  ticketsWithTimeDue: number;
  ticketsLatePercent: number | null;
}

export interface KitchenPerformanceDetailsResult {
  kpis: KitchenPerformanceTicketKpisDto;
  hourlyCompletedTickets: KitchenPerformanceHourlyPointDto[];
  ticketRows: KitchenPerformanceTicketRowDto[];
  itemPerformanceRows: KitchenPerformanceItemPerformanceRowDto[];
}

export interface KitchenPerformanceReportMeta {
  startDate: string;
  endDate: string;
  locationIds: string[];
  fetchedAt: string;
}

export interface KitchenPerformanceReportResult {
  listRows: KitchenPerformanceRowDto[];
  detailsByKey: Record<string, KitchenPerformanceDetailsResult>;
  meta: KitchenPerformanceReportMeta;
}

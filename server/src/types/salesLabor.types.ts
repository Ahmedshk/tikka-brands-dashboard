import type { SourcesOfSalesSegment } from "../services/square.service.js";

export interface SalesLaborKPIsData {
  actualTotalSales: number | null;
  actualLaborCostPercent: number | null;
  totalHours: number | null;
  salesPerManHour: number | null;
  transactionCount: number | null;
  averageCheck: number | null;
  totalDiscounts: number | null;
  totalRefunds: number | null;
  totalRefundCount: number | null;
  sourcesOfSales: SourcesOfSalesSegment[];
}

export interface HourlyBreakdownData {
  labels: string[];
  netSalesPerHour: number[];
  laborCostPercentPerHour: number[];
}

export interface SalesTrendKpiPeriod {
  totalNetSales: number;
  totalTransactions: number;
  totalHours: number;
  numDays: number;
}

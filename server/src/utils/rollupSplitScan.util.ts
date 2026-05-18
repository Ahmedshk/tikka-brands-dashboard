/**
 * Sub-range scan helpers used by the split-range readers.
 *
 * Each helper scans one TimeRange of raw Mongo orders or timecards and
 * returns the metric the caller cares about. They are deliberately tiny
 * so the parent functions in `integrationCacheRead.service.ts` can stay
 * readable.
 */
import type { TimeRange } from "./businessHours.util.js";
import type { SquareOrder } from "../services/square.service.js";
import {
  getOrderStatsFromOrders,
  isOrderCountedForNetSales,
  orderNetSalesCents,
} from "../services/square.service.js";
import type { HomebaseTimecard } from "../services/homebase.service.js";
import { filterSquareOrdersForDashboardDisplay } from "./squareOrderCacheHelpers.js";
import { sumSourcesOfSalesCentsByIdFromOrders } from "./squareSourcesOfSalesFromOrders.util.js";
import { mergeCentsByIdInto } from "./squareSourcesOfSalesMerge.util.js";

type LoadOrdersFn = (range: TimeRange) => Promise<SquareOrder[]>;
type LoadTimecardsFn = (range: TimeRange) => Promise<HomebaseTimecard[]>;

export async function sumNetSalesCentsAcrossSubRanges(
  ranges: readonly TimeRange[],
  loadOrders: LoadOrdersFn,
): Promise<number> {
  let totalCents = 0;
  for (const range of ranges) {
    const orders = filterSquareOrdersForDashboardDisplay(
      await loadOrders(range),
    );
    for (const o of orders) {
      if (!isOrderCountedForNetSales(o)) continue;
      totalCents += orderNetSalesCents(o);
    }
  }
  return totalCents;
}

export async function sumOrderStatsAndSourcesAcrossSubRanges(
  ranges: readonly TimeRange[],
  loadOrders: LoadOrdersFn,
): Promise<{
  netSalesCents: number;
  transactionCount: number;
  totalDiscountCents: number;
  totalRefundCents: number;
  refundCount: number;
  sourcesOfSalesCentsById: Map<string, number>;
}> {
  let netSalesCents = 0;
  let transactionCount = 0;
  let totalDiscountCents = 0;
  let totalRefundCents = 0;
  let refundCount = 0;
  const sourcesOfSalesCentsById = new Map<string, number>();
  for (const range of ranges) {
    const orders = await loadOrders(range);
    const stats = getOrderStatsFromOrders(orders);
    netSalesCents += stats.netSalesCents;
    transactionCount += stats.orderCount;
    totalDiscountCents += stats.totalDiscountCents;
    totalRefundCents += stats.totalRefundCents;
    refundCount += stats.refundCount;
    mergeCentsByIdInto(
      sourcesOfSalesCentsById,
      sumSourcesOfSalesCentsByIdFromOrders(orders),
    );
  }
  return {
    netSalesCents,
    transactionCount,
    totalDiscountCents,
    totalRefundCents,
    refundCount,
    sourcesOfSalesCentsById,
  };
}

export async function sumLaborCostAcrossSubRanges(
  ranges: readonly TimeRange[],
  loadTimecards: LoadTimecardsFn,
): Promise<number> {
  let total = 0;
  for (const range of ranges) {
    const cards = await loadTimecards(range);
    for (const tc of cards) {
      const costs = tc.labor?.costs;
      if (typeof costs === "number" && Number.isFinite(costs)) {
        total += costs;
      }
    }
  }
  return total;
}

export async function sumTotalHoursAcrossSubRanges(
  ranges: readonly TimeRange[],
  loadTimecards: LoadTimecardsFn,
): Promise<number> {
  let total = 0;
  for (const range of ranges) {
    const cards = await loadTimecards(range);
    for (const tc of cards) {
      const labor = tc.labor;
      const hours =
        (typeof labor?.paid_hours === "number" &&
        Number.isFinite(labor.paid_hours)
          ? labor.paid_hours
          : undefined) ??
        (typeof labor?.regular_hours === "number" &&
        Number.isFinite(labor.regular_hours)
          ? labor.regular_hours
          : undefined) ??
        0;
      total += hours;
    }
  }
  return total;
}

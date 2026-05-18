/**
 * Per-(location, businessDateKey) caches for the two daily rollup models that
 * dominate the dashboard read path:
 *
 *   - `SquareOrderDailyRollup`        (netSales / transactions / sources / categories)
 *   - `HomebaseTimecardDailyRollup`   (labor cost / paid hours)
 *
 * Seeded by the all-locations dashboard prefetch step in one $in query per
 * collection; consulted by the existing readers
 * (`tryGetOrderStatsAndSourcesFromDailyRollupsSplit`,
 * `tryGetLaborTotalsFromDailyRollupsSplit`, and the categories breakdown
 * reader) so each per-location call becomes a memory hit instead of an
 * Atlas round-trip.
 */
import type { SquareOrderDailyRollupDocument } from "../models/squareOrderDailyRollup.model.js";
import type { HomebaseTimecardDailyRollupDocument } from "../models/homebaseTimecardDailyRollup.model.js";
import {
  createPerLocationDateRollupCache,
  type PerLocationDateRollupCache,
} from "./perLocationDateRollupCache.util.js";

/** Lean shape of a `SquareOrderDailyRollup` row (as returned by `.lean()`). */
export type SquareOrderDailyRollupLean = Pick<
  SquareOrderDailyRollupDocument,
  | "businessDateKey"
  | "netSalesCents"
  | "transactionCount"
  | "totalDiscountCents"
  | "totalRefundCents"
  | "refundCount"
  | "sourcesOfSales"
  | "categoriesBreakdown"
>;

/** Lean shape of a `HomebaseTimecardDailyRollup` row. */
export type HomebaseTimecardDailyRollupLean = Pick<
  HomebaseTimecardDailyRollupDocument,
  "businessDateKey" | "totalLaborCost" | "totalPaidHours"
>;

export const squareOrderDailyRollupCache: PerLocationDateRollupCache<SquareOrderDailyRollupLean> =
  createPerLocationDateRollupCache<SquareOrderDailyRollupLean>();

export const homebaseTimecardDailyRollupCache: PerLocationDateRollupCache<HomebaseTimecardDailyRollupLean> =
  createPerLocationDateRollupCache<HomebaseTimecardDailyRollupLean>();

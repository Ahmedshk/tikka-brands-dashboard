/**
 * Per-(location, businessDateKey) cache for `SquareOrderHourlyRollup` rows.
 *
 * Stores all 0–23 slot rows for a given (location, day). When the existing
 * hourly probe (`tryGetOrderTimeSeriesFromHourlyRollupsForKeys`) needs
 * specific (date, slot) pairs, it filters the cached day in memory.
 *
 * Seeded by the all-locations dashboard prefetch step via one
 * `$in` query per page load instead of one query per location.
 */
import type { SquareOrderHourlyRollupDocument } from "../models/squareOrderHourlyRollup.model.js";
import {
  createPerLocationDateRollupCache,
  type PerLocationDateRollupCache,
} from "./perLocationDateRollupCache.util.js";

export type SquareOrderHourlyRollupLean = Pick<
  SquareOrderHourlyRollupDocument,
  | "businessDateKey"
  | "slotIndex"
  | "netSalesCents"
  | "transactionCount"
  | "sourcesOfSales"
>;

/**
 * Value is `null` when we've confirmed the day has zero rollup rows, or an
 * array of every slot row for that day (cardinality 0–24). An empty array
 * means "looked up but no slot rows" — kept distinct from `null` so the
 * existence and full-row caches can share entries without ambiguity.
 */
export const squareOrderHourlyRollupCache: PerLocationDateRollupCache<
  SquareOrderHourlyRollupLean[]
> = createPerLocationDateRollupCache<SquareOrderHourlyRollupLean[]>();

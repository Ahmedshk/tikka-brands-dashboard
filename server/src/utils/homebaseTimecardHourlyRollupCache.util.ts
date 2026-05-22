/**
 * Per-(location, businessDateKey) cache for `HomebaseTimecardHourlyRollup`
 * rows. Mirrors {@link squareOrderHourlyRollupCache}.
 *
 * Stores the 0–24 slot rows for a given (location, day). The all-locations
 * sales-labor prefetch bulk-loads this cache in one `$in` query so each
 * per-location worker hits in-process state instead of issuing its own
 * Mongo round-trip on the hot path.
 */
import type { HomebaseTimecardHourlyRollupDocument } from "../models/homebaseTimecardHourlyRollup.model.js";
import {
  createPerLocationDateRollupCache,
  type PerLocationDateRollupCache,
} from "./perLocationDateRollupCache.util.js";

export type HomebaseTimecardHourlyRollupLean = Pick<
  HomebaseTimecardHourlyRollupDocument,
  "businessDateKey" | "slotIndex" | "laborCost"
>;

/**
 * Value semantics match {@link squareOrderHourlyRollupCache}: an empty array
 * means the day has been verified to have no slot rows; `undefined` (cache
 * miss) means we haven't looked yet.
 */
export const homebaseTimecardHourlyRollupCache: PerLocationDateRollupCache<
  HomebaseTimecardHourlyRollupLean[]
> = createPerLocationDateRollupCache<HomebaseTimecardHourlyRollupLean[]>();

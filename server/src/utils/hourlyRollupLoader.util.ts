/**
 * Cache-aware loader for `SquareOrderHourlyRollup` rows, plus the bulk
 * prefetch the all-locations dashboard uses to seed it.
 *
 * The cache stores all slot rows for a (location, businessDateKey) day.
 * Callers that want specific (date, slotIndex) pairs read the day from the
 * cache and filter in memory.
 */
import mongoose from "mongoose";
import { performance } from "node:perf_hooks";
import { SquareOrderHourlyRollupModel } from "../models/squareOrderHourlyRollup.model.js";
import {
  squareOrderHourlyRollupCache,
  type SquareOrderHourlyRollupLean,
} from "./hourlyRollupCache.util.js";
import { writeRollupExistsByDate } from "./rollupExistsByDateCache.util.js";
import { dedupInflight } from "./inflightDedup.util.js";
import { logger } from "./logger.util.js";

const SELECT_FIELDS = {
  businessDateKey: 1,
  slotIndex: 1,
  netSalesCents: 1,
  transactionCount: 1,
  sourcesOfSales: 1,
} as const;

/**
 * Returns `Map<businessDateKey, SquareOrderHourlyRollupLean[]>` for the
 * requested dates. Each entry holds **all** slot rows present for that day
 * (0–24 entries; an empty array means the day has been verified empty).
 */
export async function loadSquareOrderHourlyRollupsForDates(
  locationMongoId: string,
  businessDateKeys: readonly string[],
): Promise<Map<string, SquareOrderHourlyRollupLean[]>> {
  const t0 = performance.now();
  const out = new Map<string, SquareOrderHourlyRollupLean[]>();
  const missing: string[] = [];
  for (const k of businessDateKeys) {
    const cached = squareOrderHourlyRollupCache.read(locationMongoId, k);
    if (cached === undefined) {
      missing.push(k);
    } else {
      out.set(k, cached ?? []);
    }
  }
  if (missing.length === 0) {
    logger.info("[hourly-rollup-loader] cache hit", {
      locationMongoId,
      dateCount: businessDateKeys.length,
      cacheCheckMs: Math.round(performance.now() - t0),
    });
    return out;
  }
  // Diagnostic — same signal as the daily loader miss log. If this fires
  // during a normal sales-labor or sales-trend request, the all-locations
  // bulk prefetch did NOT prime every (location, date) the per-location
  // worker needs. Per-worker Mongo round-trip → per-loc time blows up.
  logger.info("[hourly-rollup-loader] cache miss → mongo", {
    locationMongoId,
    requestedDates: businessDateKeys,
    cachedDates: [...out.keys()],
    missingDates: missing,
  });
  const tMongo = performance.now();
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const docs = (await SquareOrderHourlyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: missing },
  })
    .select(SELECT_FIELDS)
    .lean()
    .exec()) as SquareOrderHourlyRollupLean[];
  logger.info("[hourly-rollup-loader] mongo find done", {
    locationMongoId,
    missingDates: missing,
    docCount: docs.length,
    mongoMs: Math.round(performance.now() - tMongo),
  });
  const byDate = new Map<string, SquareOrderHourlyRollupLean[]>();
  for (const d of docs) {
    let arr = byDate.get(d.businessDateKey);
    if (!arr) {
      arr = [];
      byDate.set(d.businessDateKey, arr);
    }
    arr.push(d);
  }
  for (const k of missing) {
    const arr = byDate.get(k) ?? [];
    squareOrderHourlyRollupCache.write(locationMongoId, k, arr);
    // Keep the lighter existence cache aligned so the existence pre-check
    // short-circuits in concert with the full-row cache.
    writeRollupExistsByDate(locationMongoId, k, arr.length > 0);
    out.set(k, arr);
  }
  return out;
}

/**
 * Bulk pre-populate the SquareOrderHourlyRollup cache for many locations in
 * one Mongo round-trip.
 */
export async function bulkPrefetchSquareOrderHourlyRollups(params: {
  locationMongoIds: readonly string[];
  businessDateKeys: readonly string[];
}): Promise<void> {
  const { locationMongoIds, businessDateKeys } = params;
  if (locationMongoIds.length === 0 || businessDateKeys.length === 0) return;
  const key = `squareOrderHourlyRollups|${[...locationMongoIds].sort().join(",")}|${[...businessDateKeys].sort().join(",")}`;
  return dedupInflight(key, () => bulkPrefetchSquareOrderHourlyRollupsImpl(params));
}

async function bulkPrefetchSquareOrderHourlyRollupsImpl(params: {
  locationMongoIds: readonly string[];
  businessDateKeys: readonly string[];
}): Promise<void> {
  const { locationMongoIds, businessDateKeys } = params;
  // Cache-first short-circuit — see comment in
  // `bulkPrefetchSquareOrderDailyRollupsImpl` for the full rationale. The
  // dashboard's 3 parallel endpoints each call this prefetch; once the first
  // populates the cache, the rest should skip Mongo instead of re-running
  // the same $in query and risking cluster contention.
  if (
    locationMongoIds.every((lid) =>
      businessDateKeys.every(
        (dk) => squareOrderHourlyRollupCache.read(lid, dk) !== undefined,
      ),
    )
  ) {
    return;
  }
  const oids = locationMongoIds.map((id) => new mongoose.Types.ObjectId(id));
  const docs = (await SquareOrderHourlyRollupModel.find({
    locationId: { $in: oids },
    businessDateKey: { $in: [...businessDateKeys] },
  })
    .select({ ...SELECT_FIELDS, locationId: 1 })
    .lean()
    .exec()) as Array<SquareOrderHourlyRollupLean & { locationId: mongoose.Types.ObjectId }>;
  const byKey = new Map<string, SquareOrderHourlyRollupLean[]>();
  for (const d of docs) {
    const k = `${d.locationId.toString()}|${d.businessDateKey}`;
    let arr = byKey.get(k);
    if (!arr) {
      arr = [];
      byKey.set(k, arr);
    }
    arr.push({
      businessDateKey: d.businessDateKey,
      slotIndex: d.slotIndex,
      netSalesCents: d.netSalesCents,
      transactionCount: d.transactionCount,
      sourcesOfSales: d.sourcesOfSales,
    });
  }
  for (const lid of locationMongoIds) {
    for (const dk of businessDateKeys) {
      const arr = byKey.get(`${lid}|${dk}`) ?? [];
      squareOrderHourlyRollupCache.write(lid, dk, arr);
      writeRollupExistsByDate(lid, dk, arr.length > 0);
    }
  }
}

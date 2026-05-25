/**
 * Cache-aware loader for `HomebaseTimecardHourlyRollup` rows, plus the bulk
 * prefetch the all-locations dashboard uses to seed it. Mirrors
 * {@link hourlyRollupLoader.util.ts} on the Square side.
 */
import mongoose from "mongoose";
import { performance } from "node:perf_hooks";
import { HomebaseTimecardHourlyRollupModel } from "../models/homebaseTimecardHourlyRollup.model.js";
import {
  homebaseTimecardHourlyRollupCache,
  type HomebaseTimecardHourlyRollupLean,
} from "./homebaseTimecardHourlyRollupCache.util.js";
import { dedupInflight } from "./inflightDedup.util.js";
import { logger } from "./logger.util.js";

const SELECT_FIELDS = {
  businessDateKey: 1,
  slotIndex: 1,
  laborCost: 1,
} as const;

/**
 * Returns `Map<businessDateKey, HomebaseTimecardHourlyRollupLean[]>` for the
 * requested dates. Each entry holds **all** slot rows present for that day
 * (0–24 entries; an empty array means the day has been verified empty).
 */
export async function loadHomebaseTimecardHourlyRollupsForDates(
  locationMongoId: string,
  businessDateKeys: readonly string[],
): Promise<Map<string, HomebaseTimecardHourlyRollupLean[]>> {
  const t0 = performance.now();
  const out = new Map<string, HomebaseTimecardHourlyRollupLean[]>();
  const missing: string[] = [];
  for (const k of businessDateKeys) {
    const cached = homebaseTimecardHourlyRollupCache.read(locationMongoId, k);
    if (cached === undefined) {
      missing.push(k);
    } else {
      out.set(k, cached ?? []);
    }
  }
  if (missing.length === 0) {
    logger.info("[homebase-hourly-rollup-loader] cache hit", {
      locationMongoId,
      dateCount: businessDateKeys.length,
      cacheCheckMs: Math.round(performance.now() - t0),
    });
    return out;
  }
  const tMongo = performance.now();
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const docs = (await HomebaseTimecardHourlyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: missing },
  })
    .select(SELECT_FIELDS)
    .lean()
    .exec()) as HomebaseTimecardHourlyRollupLean[];
  logger.info("[homebase-hourly-rollup-loader] mongo find done", {
    locationMongoId,
    missingDates: missing,
    docCount: docs.length,
    mongoMs: Math.round(performance.now() - tMongo),
  });
  const byDate = new Map<string, HomebaseTimecardHourlyRollupLean[]>();
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
    homebaseTimecardHourlyRollupCache.write(locationMongoId, k, arr);
    out.set(k, arr);
  }
  return out;
}

/**
 * Bulk pre-populate the HomebaseTimecardHourlyRollup cache for many locations
 * in one Mongo round-trip. Used by the all-locations dashboard prefetch.
 */
export async function bulkPrefetchHomebaseTimecardHourlyRollups(params: {
  locationMongoIds: readonly string[];
  businessDateKeys: readonly string[];
}): Promise<void> {
  const { locationMongoIds, businessDateKeys } = params;
  if (locationMongoIds.length === 0 || businessDateKeys.length === 0) return;
  const key = `homebaseTimecardHourlyRollups|${[...locationMongoIds].sort().join(",")}|${[...businessDateKeys].sort().join(",")}`;
  return dedupInflight(key, () => bulkPrefetchHomebaseTimecardHourlyRollupsImpl(params));
}

async function bulkPrefetchHomebaseTimecardHourlyRollupsImpl(params: {
  locationMongoIds: readonly string[];
  businessDateKeys: readonly string[];
}): Promise<void> {
  const { locationMongoIds, businessDateKeys } = params;
  // Cache-first short-circuit — see comment in
  // `bulkPrefetchSquareOrderDailyRollupsImpl` (dailyRollupLoader.util.ts)
  // for the full rationale.
  if (
    locationMongoIds.every((lid) =>
      businessDateKeys.every(
        (dk) => homebaseTimecardHourlyRollupCache.read(lid, dk) !== undefined,
      ),
    )
  ) {
    return;
  }
  const oids = locationMongoIds.map((id) => new mongoose.Types.ObjectId(id));
  const docs = (await HomebaseTimecardHourlyRollupModel.find({
    locationId: { $in: oids },
    businessDateKey: { $in: [...businessDateKeys] },
  })
    .select({ ...SELECT_FIELDS, locationId: 1 })
    .lean()
    .exec()) as Array<HomebaseTimecardHourlyRollupLean & { locationId: mongoose.Types.ObjectId }>;
  const byKey = new Map<string, HomebaseTimecardHourlyRollupLean[]>();
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
      laborCost: d.laborCost,
    });
  }
  for (const lid of locationMongoIds) {
    for (const dk of businessDateKeys) {
      const arr = byKey.get(`${lid}|${dk}`) ?? [];
      homebaseTimecardHourlyRollupCache.write(lid, dk, arr);
    }
  }
}

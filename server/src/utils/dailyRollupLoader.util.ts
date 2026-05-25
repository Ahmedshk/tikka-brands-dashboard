/**
 * Cache-aware loaders for the daily rollup models.
 *
 * Each loader:
 *  1. Looks up every requested `businessDateKey` in the per-(location, date)
 *     cache for that model.
 *  2. If any are missing, issues a SINGLE Mongo `find({locationId,
 *     businessDateKey: {$in: missing}})` to fetch them.
 *  3. Primes the cache for both present and confirmed-absent dates so
 *     subsequent calls within the TTL are zero-round-trip.
 *
 * The bulk all-locations prefetch step pre-fills the cache for every
 * (location, date) combination the dashboard needs before fan-out, which
 * makes step 2 a no-op for the common case.
 */
import mongoose from "mongoose";
import { SquareOrderDailyRollupModel } from "../models/squareOrderDailyRollup.model.js";
import { HomebaseTimecardDailyRollupModel } from "../models/homebaseTimecardDailyRollup.model.js";
import {
  squareOrderDailyRollupCache,
  homebaseTimecardDailyRollupCache,
  type SquareOrderDailyRollupLean,
  type HomebaseTimecardDailyRollupLean,
} from "./dailyRollupCaches.util.js";
import { dedupInflight } from "./inflightDedup.util.js";
import { logger } from "./logger.util.js";

function dedupKey(prefix: string, ids: readonly string[], dates: readonly string[]): string {
  return `${prefix}|${[...ids].sort().join(",")}|${[...dates].sort().join(",")}`;
}

export async function loadSquareOrderDailyRollupsForDates(
  locationMongoId: string,
  businessDateKeys: readonly string[],
): Promise<SquareOrderDailyRollupLean[]> {
  if (businessDateKeys.length === 0) return [];
  const present: SquareOrderDailyRollupLean[] = [];
  const missing: string[] = [];
  for (const k of businessDateKeys) {
    const cached = squareOrderDailyRollupCache.read(locationMongoId, k);
    if (cached === undefined) {
      missing.push(k);
    } else if (cached !== null) {
      present.push(cached);
    }
  }
  if (missing.length === 0) return present;
  // Diagnostic — if this fires for a sales-labor request, the all-locations
  // bulk prefetch did NOT prime every key the per-location worker queries.
  // That means each worker issues this Mongo find on its own, adding ~150ms
  // Atlas latency per location → multi-second per-loc time even on a "cache
  // hit" code path. Logged once per call so we can grep for the pattern.
  logger.info('[daily-rollup-loader] square cache miss → mongo find', {
    locationMongoId,
    requestedDateCount: businessDateKeys.length,
    cachedDateCount: present.length,
    missingDateCount: missing.length,
    missingDates: missing,
  });
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const docs = (await SquareOrderDailyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: missing },
  })
    .select({
      businessDateKey: 1,
      netSalesCents: 1,
      transactionCount: 1,
      totalDiscountCents: 1,
      totalRefundCents: 1,
      refundCount: 1,
      sourcesOfSales: 1,
      categoriesBreakdown: 1,
    })
    .lean()
    .exec()) as SquareOrderDailyRollupLean[];
  const byDate = new Map<string, SquareOrderDailyRollupLean>();
  for (const d of docs) byDate.set(d.businessDateKey, d);
  for (const k of missing) {
    const doc = byDate.get(k) ?? null;
    squareOrderDailyRollupCache.write(locationMongoId, k, doc);
    if (doc) present.push(doc);
  }
  return present;
}

export async function loadHomebaseTimecardDailyRollupsForDates(
  locationMongoId: string,
  businessDateKeys: readonly string[],
): Promise<HomebaseTimecardDailyRollupLean[]> {
  if (businessDateKeys.length === 0) return [];
  const present: HomebaseTimecardDailyRollupLean[] = [];
  const missing: string[] = [];
  for (const k of businessDateKeys) {
    const cached = homebaseTimecardDailyRollupCache.read(locationMongoId, k);
    if (cached === undefined) {
      missing.push(k);
    } else if (cached !== null) {
      present.push(cached);
    }
  }
  if (missing.length === 0) return present;
  // Diagnostic — see comment in `loadSquareOrderDailyRollupsForDates` for
  // why this signal matters. Non-zero `missingDateCount` during a normal
  // (warm-prefetch) sales-labor request is the smoking gun for "prefetch
  // primed the wrong keys" and explains slow per-loc workers.
  logger.info('[daily-rollup-loader] homebase cache miss → mongo find', {
    locationMongoId,
    requestedDateCount: businessDateKeys.length,
    cachedDateCount: present.length,
    missingDateCount: missing.length,
    missingDates: missing,
  });
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const docs = (await HomebaseTimecardDailyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: missing },
  })
    .select({
      businessDateKey: 1,
      totalLaborCost: 1,
      totalPaidHours: 1,
    })
    .lean()
    .exec()) as HomebaseTimecardDailyRollupLean[];
  const byDate = new Map<string, HomebaseTimecardDailyRollupLean>();
  for (const d of docs) byDate.set(d.businessDateKey, d);
  for (const k of missing) {
    const doc = byDate.get(k) ?? null;
    homebaseTimecardDailyRollupCache.write(locationMongoId, k, doc);
    if (doc) present.push(doc);
  }
  return present;
}

/**
 * Bulk pre-populate the SquareOrderDailyRollup cache for many locations in
 * one Mongo round-trip.
 */
export async function bulkPrefetchSquareOrderDailyRollups(params: {
  locationMongoIds: readonly string[];
  businessDateKeys: readonly string[];
}): Promise<void> {
  const { locationMongoIds, businessDateKeys } = params;
  if (locationMongoIds.length === 0 || businessDateKeys.length === 0) return;
  return dedupInflight(
    dedupKey("squareOrderDailyRollups", locationMongoIds, businessDateKeys),
    () => bulkPrefetchSquareOrderDailyRollupsImpl(params),
  );
}

async function bulkPrefetchSquareOrderDailyRollupsImpl(params: {
  locationMongoIds: readonly string[];
  businessDateKeys: readonly string[];
}): Promise<void> {
  const { locationMongoIds, businessDateKeys } = params;
  // Cache-first short-circuit. The dashboard fires 3 endpoints in parallel
  // (kpis / hourly-breakdown / timesheet), each of which calls this prefetch.
  // `dedupInflight` only collapses concurrent in-flight calls — once the first
  // prefetch finishes (cache populated, in-flight slot cleared), subsequent
  // callers were running the same Mongo $in query AGAIN even though every
  // (locationId, businessDateKey) entry was already in `squareOrderDailyRollupCache`
  // (60s TTL). Under cluster contention that repeat query was costing 5-11s.
  // Skipping Mongo when the cache already covers every requested pair makes
  // the second/third caller a memory hit.
  if (
    locationMongoIds.every((lid) =>
      businessDateKeys.every(
        (dk) => squareOrderDailyRollupCache.read(lid, dk) !== undefined,
      ),
    )
  ) {
    return;
  }
  const oids = locationMongoIds.map((id) => new mongoose.Types.ObjectId(id));
  const docs = (await SquareOrderDailyRollupModel.find({
    locationId: { $in: oids },
    businessDateKey: { $in: [...businessDateKeys] },
  })
    .select({
      locationId: 1,
      businessDateKey: 1,
      netSalesCents: 1,
      transactionCount: 1,
      totalDiscountCents: 1,
      totalRefundCents: 1,
      refundCount: 1,
      sourcesOfSales: 1,
      categoriesBreakdown: 1,
    })
    .lean()
    .exec()) as Array<SquareOrderDailyRollupLean & { locationId: mongoose.Types.ObjectId }>;
  const byKey = new Map<string, SquareOrderDailyRollupLean>();
  for (const d of docs) {
    const lid = d.locationId.toString();
    const entry: SquareOrderDailyRollupLean = {
      businessDateKey: d.businessDateKey,
      netSalesCents: d.netSalesCents,
      transactionCount: d.transactionCount,
      totalDiscountCents: d.totalDiscountCents,
      totalRefundCents: d.totalRefundCents,
      refundCount: d.refundCount,
      sourcesOfSales: d.sourcesOfSales,
      ...(d.categoriesBreakdown !== undefined
        ? { categoriesBreakdown: d.categoriesBreakdown }
        : {}),
    };
    byKey.set(`${lid}|${d.businessDateKey}`, entry);
  }
  for (const lid of locationMongoIds) {
    for (const dk of businessDateKeys) {
      squareOrderDailyRollupCache.write(lid, dk, byKey.get(`${lid}|${dk}`) ?? null);
    }
  }
}

export async function bulkPrefetchHomebaseTimecardDailyRollups(params: {
  locationMongoIds: readonly string[];
  businessDateKeys: readonly string[];
}): Promise<void> {
  const { locationMongoIds, businessDateKeys } = params;
  if (locationMongoIds.length === 0 || businessDateKeys.length === 0) return;
  return dedupInflight(
    dedupKey("homebaseTimecardDailyRollups", locationMongoIds, businessDateKeys),
    () => bulkPrefetchHomebaseTimecardDailyRollupsImpl(params),
  );
}

async function bulkPrefetchHomebaseTimecardDailyRollupsImpl(params: {
  locationMongoIds: readonly string[];
  businessDateKeys: readonly string[];
}): Promise<void> {
  const { locationMongoIds, businessDateKeys } = params;
  // Cache-first short-circuit — see comment in
  // `bulkPrefetchSquareOrderDailyRollupsImpl` for the full rationale.
  if (
    locationMongoIds.every((lid) =>
      businessDateKeys.every(
        (dk) => homebaseTimecardDailyRollupCache.read(lid, dk) !== undefined,
      ),
    )
  ) {
    return;
  }
  const oids = locationMongoIds.map((id) => new mongoose.Types.ObjectId(id));
  const docs = (await HomebaseTimecardDailyRollupModel.find({
    locationId: { $in: oids },
    businessDateKey: { $in: [...businessDateKeys] },
  })
    .select({
      locationId: 1,
      businessDateKey: 1,
      totalLaborCost: 1,
      totalPaidHours: 1,
    })
    .lean()
    .exec()) as Array<HomebaseTimecardDailyRollupLean & { locationId: mongoose.Types.ObjectId }>;
  const byKey = new Map<string, HomebaseTimecardDailyRollupLean>();
  for (const d of docs) {
    const lid = d.locationId.toString();
    byKey.set(`${lid}|${d.businessDateKey}`, {
      businessDateKey: d.businessDateKey,
      totalLaborCost: d.totalLaborCost,
      totalPaidHours: d.totalPaidHours,
    });
  }
  for (const lid of locationMongoIds) {
    for (const dk of businessDateKeys) {
      homebaseTimecardDailyRollupCache.write(lid, dk, byKey.get(`${lid}|${dk}`) ?? null);
    }
  }
}

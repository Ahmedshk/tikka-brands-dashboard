/**
 * Rollup-first reads for Square order aggregates (daily + hourly + period).
 */
import mongoose from "mongoose";
import { SquareOrderDailyRollupModel } from "../models/squareOrderDailyRollup.model.js";
import { SquareOrderHourlyRollupModel } from "../models/squareOrderHourlyRollup.model.js";
import { SquareOrderPeriodRollupModel } from "../models/squareOrderPeriodRollup.model.js";
import { HomebaseTimecardDailyRollupModel } from "../models/homebaseTimecardDailyRollup.model.js";
import {
  businessDateKeysIntersectingUtcRange,
  businessDayUtcRangeIsoStrings,
} from "../utils/businessDayUtcRange.util.js";
import type { SalesTrendGranularity } from "../utils/homebaseOrderedBuckets.util.js";
import type { TimeRange } from "../utils/businessHours.util.js";
import type { SourcesOfSalesSegment } from "./square.service.js";
import { mapHourlyChartKeyToRollupSlot } from "../utils/hourlyRollupRead.util.js";
import { logger } from "../utils/logger.util.js";
import { mergeCategoryBreakdownFromDailyRollupDocs } from "../utils/squareCategoryRollupBreakdown.util.js";
import {
  type BatchRetrieveCatalogFn,
  type NetSalesByCategoryResult,
} from "../utils/squareNetSalesByCategoryHelpers.js";
import {
  firstMissingCategoriesBreakdownKey,
  matchNetSalesByCategoryRangeToPeriodRollup,
  netSalesByCategoryResultFromMergedBreakdown,
} from "../utils/squareNetSalesByCategoryRollupReadHelpers.util.js";
import {
  aggregateSourcesOfSalesBySourceAndBucketKeys,
  buildHourlyChartCoordsOrNull,
  hourlyRollupDocsToSourcesByPairMap,
  mergeHourlySourcesIntoBySourceAndChartKey,
  uniqueHourlySlotPairsFromCoords,
} from "../utils/squareOrderTimeSeriesBySourceRollupHelpers.util.js";
import {
  mergeSourcesOfSalesFromDailyRollupDocs,
  sumSourcesOfSalesCentsByIdFromDailyRollupDocs,
} from "../utils/squareSourcesOfSalesMerge.util.js";
import {
  buildRangeKey,
  readRollupNegativeCache,
  writeRollupNegativeCache,
} from "../utils/rollupReadCache.util.js";
import { computeRollupUncoveredSubRanges } from "../utils/rollupSplitRange.util.js";

const ROLLUP_READ_ENABLED =
  (process.env.ROLLUP_READ_ENABLED ?? "true").trim().toLowerCase() !== "false";

const BATCH_RETRIEVE_CATALOG_CHUNK = 100;

/** Outcome of reading order time-series from Mongo rollups (sales-trend / charts). */
export type RollupTimeSeriesHit = {
  hit: true;
  netSales: number[];
  transactionCount: number[];
};

export type RollupTimeSeriesMiss = {
  hit: false;
  /** Human-readable explanation for logs */
  reason: string;
  /** Stable identifier, e.g. `DAILY_MISSING_ROLLUP_ROWS` */
  code: string;
  detail?: Record<string, unknown>;
};

export type RollupTimeSeriesResult = RollupTimeSeriesHit | RollupTimeSeriesMiss;

function miss(
  code: string,
  reason: string,
  detail?: Record<string, unknown>,
): RollupTimeSeriesMiss {
  return detail === undefined
    ? { hit: false, code, reason }
    : { hit: false, code, reason, detail };
}

function hitSeries(
  netSales: number[],
  transactionCount: number[],
): RollupTimeSeriesHit {
  return { hit: true, netSales, transactionCount };
}

function fullBusinessDaysCoveredByRange(
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
): string[] {
  const startMs = new Date(range.startAt).getTime();
  const endMs = new Date(range.endAt).getTime();
  const keys = businessDateKeysIntersectingUtcRange(
    range.startAt,
    range.endAt,
    timezone,
    businessStartTime,
  );
  const full: string[] = [];
  for (const key of keys) {
    const { startAt, endAt } = businessDayUtcRangeIsoStrings(
      timezone,
      businessStartTime,
      key,
    );
    const rs = new Date(startAt).getTime();
    const re = new Date(endAt).getTime();
    if (startMs <= rs && re <= endMs) full.push(key);
  }
  return full;
}

export async function tryGetOrderStatsAndSourcesFromDailyRollups(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
): Promise<{
  actualTotalSales: number;
  transactionCount: number;
  totalDiscounts: number;
  totalRefunds: number;
  totalRefundCount: number;
  sourcesOfSales: SourcesOfSalesSegment[];
} | null> {
  if (!ROLLUP_READ_ENABLED) return null;
  const keys = fullBusinessDaysCoveredByRange(
    range,
    timezone,
    businessStartTime,
  );
  if (keys.length === 0) return null;
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const dailies = await SquareOrderDailyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: keys },
  })
    .lean()
    .exec();
  if (dailies.length !== keys.length) {
    logger.debug("rollup read: missing daily square order rollup rows", {
      locationMongoId,
      expected: keys.length,
      found: dailies.length,
    });
    return null;
  }
  let netSalesCents = 0;
  let transactionCount = 0;
  let totalDiscountCents = 0;
  let totalRefundCents = 0;
  let refundCount = 0;
  for (const d of dailies) {
    netSalesCents += d.netSalesCents ?? 0;
    transactionCount += d.transactionCount ?? 0;
    totalDiscountCents += d.totalDiscountCents ?? 0;
    totalRefundCents += d.totalRefundCents ?? 0;
    refundCount += d.refundCount ?? 0;
  }
  const sourcesRaw = mergeSourcesOfSalesFromDailyRollupDocs(dailies);
  return {
    actualTotalSales: netSalesCents / 100,
    transactionCount,
    totalDiscounts: totalDiscountCents / 100,
    totalRefunds: totalRefundCents / 100,
    totalRefundCount: refundCount,
    sourcesOfSales: sourcesRaw as SourcesOfSalesSegment[],
  };
}

/**
 * Read total labor cost + paid hours from `HomebaseTimecardDailyRollup` for
 * the business-day window aligned to `range`. Returns `null` on miss
 * (rollups disabled, range doesn't cover full business days, or any of the
 * expected daily rows is missing — strict like the Square daily reader).
 *
 * Callers use this as a fast path before falling back to a per-timecard scan
 * of `loadHomebaseTimecardsForMongoRange`.
 */
export async function tryGetLaborTotalsFromDailyRollups(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
): Promise<{ totalLaborCost: number; totalPaidHours: number } | null> {
  if (!ROLLUP_READ_ENABLED) return null;
  const keys = fullBusinessDaysCoveredByRange(
    range,
    timezone,
    businessStartTime,
  );
  if (keys.length === 0) return null;
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const dailies = await HomebaseTimecardDailyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: keys },
  })
    .lean()
    .exec();
  if (dailies.length !== keys.length) {
    logger.debug("rollup read: missing daily homebase timecard rollup rows", {
      locationMongoId,
      expected: keys.length,
      found: dailies.length,
    });
    return null;
  }
  let totalLaborCost = 0;
  let totalPaidHours = 0;
  for (const d of dailies) {
    if (typeof d.totalLaborCost === "number" && Number.isFinite(d.totalLaborCost)) {
      totalLaborCost += d.totalLaborCost;
    }
    if (typeof d.totalPaidHours === "number" && Number.isFinite(d.totalPaidHours)) {
      totalPaidHours += d.totalPaidHours;
    }
  }
  return { totalLaborCost, totalPaidHours };
}

export async function tryGetNetSalesDollarsFromDailyRollups(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
): Promise<number | null> {
  const full = await tryGetOrderStatsAndSourcesFromDailyRollups(
    locationMongoId,
    range,
    timezone,
    businessStartTime,
  );
  return full ? full.actualTotalSales : null;
}

/**
 * Split-range variant: returns whatever daily rollup rows ARE present plus
 * the sub-ranges still missing. The caller scans those sub-ranges from raw
 * orders/timecards and sums with the rollup total.
 *
 * Returns `null` when there is nothing to gain (ROLLUP_READ_ENABLED off, no
 * full business days in range, or zero rollup rows present — the caller
 * should fall back to a single full-range scan in those cases).
 */
export async function tryGetOrderStatsAndSourcesFromDailyRollupsSplit(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
): Promise<{
  rollupNetSalesCents: number;
  rollupTransactionCount: number;
  rollupTotalDiscountCents: number;
  rollupTotalRefundCents: number;
  rollupRefundCount: number;
  /** Cents per normalized sourcesOfSales segment id (merge with raw-order map before rendering). */
  rollupSourcesOfSalesCentsById: Map<string, number>;
  presentKeys: Set<string>;
  uncoveredRanges: TimeRange[];
} | null> {
  if (!ROLLUP_READ_ENABLED) return null;
  const keys = fullBusinessDaysCoveredByRange(
    range,
    timezone,
    businessStartTime,
  );
  if (keys.length === 0) return null;
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const dailies = await SquareOrderDailyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: keys },
  })
    .lean()
    .exec();
  if (dailies.length === 0) return null;
  const presentKeys = new Set(dailies.map((d) => d.businessDateKey));
  let rollupNetSalesCents = 0;
  let rollupTransactionCount = 0;
  let rollupTotalDiscountCents = 0;
  let rollupTotalRefundCents = 0;
  let rollupRefundCount = 0;
  for (const d of dailies) {
    rollupNetSalesCents += d.netSalesCents ?? 0;
    rollupTransactionCount += d.transactionCount ?? 0;
    rollupTotalDiscountCents += d.totalDiscountCents ?? 0;
    rollupTotalRefundCents += d.totalRefundCents ?? 0;
    rollupRefundCount += d.refundCount ?? 0;
  }
  const rollupSourcesOfSalesCentsById =
    sumSourcesOfSalesCentsByIdFromDailyRollupDocs(dailies);
  const uncoveredRanges = computeRollupUncoveredSubRanges(
    range,
    timezone,
    businessStartTime,
    presentKeys,
  );
  return {
    rollupNetSalesCents,
    rollupTransactionCount,
    rollupTotalDiscountCents,
    rollupTotalRefundCents,
    rollupRefundCount,
    rollupSourcesOfSalesCentsById,
    presentKeys,
    uncoveredRanges,
  };
}

export type DailyLaborSplitResult = {
  rollupTotalLaborCost: number;
  rollupTotalPaidHours: number;
  presentKeys: Set<string>;
  uncoveredRanges: TimeRange[];
};

/**
 * Split-range variant for labor daily rollups. See
 * {@link tryGetOrderStatsAndSourcesFromDailyRollupsSplit} for the contract.
 */
export async function tryGetLaborTotalsFromDailyRollupsSplit(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
): Promise<DailyLaborSplitResult | null> {
  if (!ROLLUP_READ_ENABLED) return null;
  const keys = fullBusinessDaysCoveredByRange(
    range,
    timezone,
    businessStartTime,
  );
  if (keys.length === 0) return null;
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const dailies = await HomebaseTimecardDailyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: keys },
  })
    .lean()
    .exec();
  if (dailies.length === 0) return null;
  const presentKeys = new Set(dailies.map((d) => d.businessDateKey));
  let rollupTotalLaborCost = 0;
  let rollupTotalPaidHours = 0;
  for (const d of dailies) {
    if (
      typeof d.totalLaborCost === "number" &&
      Number.isFinite(d.totalLaborCost)
    ) {
      rollupTotalLaborCost += d.totalLaborCost;
    }
    if (
      typeof d.totalPaidHours === "number" &&
      Number.isFinite(d.totalPaidHours)
    ) {
      rollupTotalPaidHours += d.totalPaidHours;
    }
  }
  const uncoveredRanges = computeRollupUncoveredSubRanges(
    range,
    timezone,
    businessStartTime,
    presentKeys,
  );
  return {
    rollupTotalLaborCost,
    rollupTotalPaidHours,
    presentKeys,
    uncoveredRanges,
  };
}

/**
 * Sales-by-category from daily rollups when every fully-covered business day has `categoriesBreakdown`.
 * Merges by category id, resolves labels via catalog batch (same as order path). Caller supplies
 * `batchRetrieve` (e.g. `createMongoCatalogBatchRetrieve`) to avoid importing integrationCacheRead here.
 */
export async function tryGetNetSalesByCategoryFromDailyRollups(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  batchRetrieve: BatchRetrieveCatalogFn,
  accessToken: string,
): Promise<NetSalesByCategoryResult | null> {
  if (!ROLLUP_READ_ENABLED) return null;
  const keys = fullBusinessDaysCoveredByRange(
    range,
    timezone,
    businessStartTime,
  );
  if (keys.length === 0) return null;

  const periodMatch = matchNetSalesByCategoryRangeToPeriodRollup(
    keys,
    timezone,
  );
  if (periodMatch) {
    const rolled = await tryGetNetSalesByCategoryFromPeriodRollup(
      locationMongoId,
      periodMatch.granularity,
      periodMatch.periodKey,
      batchRetrieve,
      accessToken,
    );
    if (rolled) return rolled;
  }

  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const dailies = await SquareOrderDailyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: keys },
  })
    .lean()
    .exec();
  if (dailies.length !== keys.length) {
    logger.debug("rollup read: missing daily rows for sales-by-category", {
      locationMongoId,
      expected: keys.length,
      found: dailies.length,
    });
    return null;
  }
  const byKey = new Map(dailies.map((d) => [d.businessDateKey, d]));
  const missingBreakdownKey = firstMissingCategoriesBreakdownKey(keys, byKey);
  if (missingBreakdownKey != null) {
    logger.debug("rollup read: daily missing categoriesBreakdown", {
      locationMongoId,
      businessDateKey: missingBreakdownKey,
    });
    return null;
  }

  const merged = mergeCategoryBreakdownFromDailyRollupDocs(dailies);
  return netSalesByCategoryResultFromMergedBreakdown(
    merged,
    batchRetrieve,
    accessToken,
    BATCH_RETRIEVE_CATALOG_CHUNK,
  );
}

async function tryGetNetSalesByCategoryFromPeriodRollup(
  locationMongoId: string,
  granularity: "week" | "month",
  periodKey: string,
  batchRetrieve: BatchRetrieveCatalogFn,
  accessToken: string,
): Promise<NetSalesByCategoryResult | null> {
  if (!ROLLUP_READ_ENABLED) return null;
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const doc = await SquareOrderPeriodRollupModel.findOne({
    locationId: oid,
    granularity,
    periodKey,
  })
    .lean()
    .exec();
  if (!doc || !Array.isArray(doc.categoriesBreakdown)) return null;

  const merged = doc.categoriesBreakdown;
  return netSalesByCategoryResultFromMergedBreakdown(
    merged,
    batchRetrieve,
    accessToken,
    BATCH_RETRIEVE_CATALOG_CHUNK,
  );
}

export async function tryGetHourlyNetSalesCentsBySlotFromRollups(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
): Promise<number[] | null> {
  if (!ROLLUP_READ_ENABLED) return null;
  const keys = fullBusinessDaysCoveredByRange(
    range,
    timezone,
    businessStartTime,
  );
  if (keys.length !== 1) return null;
  const businessDateKey = keys[0]!;
  const negKey = {
    locationMongoId,
    granularity: "hourly-slot",
    rangeKey: businessDateKey,
  };
  if (readRollupNegativeCache(negKey)) {
    return null;
  }
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  // Cheap existence pre-check before the full find+sort. With the
  // (locationId, businessDateKey) index this is ~1-5 ms and lets us bail out
  // immediately when no hourly rollup rows exist for the day.
  const anyExists = await SquareOrderHourlyRollupModel.exists({
    locationId: oid,
    businessDateKey,
  });
  if (!anyExists) {
    writeRollupNegativeCache(negKey, {
      code: "HOURLY_SLOT_NO_ROWS_FOR_DATE",
      reason: `No hourly rollup rows exist for ${businessDateKey}`,
    });
    return null;
  }
  const hourly = await SquareOrderHourlyRollupModel.find({
    locationId: oid,
    businessDateKey,
  })
    .sort({ slotIndex: 1 })
    .lean()
    .exec();
  if (hourly.length !== 24) {
    writeRollupNegativeCache(negKey, {
      code: "HOURLY_SLOT_PARTIAL",
      reason: `Expected 24 hourly slots, found ${hourly.length}`,
    });
    return null;
  }
  const out = new Array<number>(24).fill(0);
  for (const h of hourly) {
    const i = h.slotIndex;
    if (i >= 0 && i < 24) out[i] = h.netSalesCents ?? 0;
  }
  return out;
}

function dailyBusinessKeyFullyInRange(
  businessDateKey: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
): boolean {
  const { startAt, endAt } = businessDayUtcRangeIsoStrings(
    timezone,
    businessStartTime,
    businessDateKey,
  );
  const rs = new Date(startAt).getTime();
  const re = new Date(endAt).getTime();
  const startMs = new Date(range.startAt).getTime();
  const endMs = new Date(range.endAt).getTime();
  return startMs <= rs && re <= endMs;
}

function validateDailyKeys(
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  keys: string[],
): RollupTimeSeriesMiss | null {
  for (const k of keys) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) {
      return miss("INVALID_DAILY_KEY_FORMAT", `Chart key is not yyyy-MM-dd: ${k}`, {
        businessDateKey: k,
      });
    }
    if (!dailyBusinessKeyFullyInRange(k, range, timezone, businessStartTime)) {
      return miss(
        "DAILY_BUCKET_NOT_FULLY_IN_RANGE",
        `Business day ${k} is not fully contained in the requested UTC range (strict rollup rule)`,
        {
          businessDateKey: k,
          rangeStart: range.startAt,
          rangeEnd: range.endAt,
          timezone,
          businessStartTime,
        },
      );
    }
  }
  return null;
}

function buildDailySeriesFromDocs(
  keys: string[],
  byKey: Map<string, { netSalesCents?: number | null; transactionCount?: number | null }>,
): RollupTimeSeriesHit {
  const netSales: number[] = [];
  const transactionCount: number[] = [];
  for (const k of keys) {
    const d = byKey.get(k);
    netSales.push(d ? (d.netSalesCents ?? 0) / 100 : 0);
    transactionCount.push(d ? (d.transactionCount ?? 0) : 0);
  }
  return hitSeries(netSales, transactionCount);
}

/** All `keys` must be yyyy-MM-dd business dates fully contained in `range`. */
export async function tryGetOrderTimeSeriesFromDailyRollups(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  keys: string[],
): Promise<RollupTimeSeriesResult> {
  if (!ROLLUP_READ_ENABLED) {
    return miss(
      "ROLLUP_READ_DISABLED",
      "Rollup reads disabled (set ROLLUP_READ_ENABLED=false or env unset)",
    );
  }
  if (keys.length === 0) {
    return miss("EMPTY_BUCKET_KEYS", "No chart bucket keys for daily rollup read");
  }
  const validationMiss = validateDailyKeys(range, timezone, businessStartTime, keys);
  if (validationMiss) {
    if (validationMiss.code === "DAILY_BUCKET_NOT_FULLY_IN_RANGE") {
      logger.debug("rollup read: daily bucket not fully in range", {
        locationMongoId,
        businessDateKey: validationMiss.detail?.businessDateKey,
      });
    }
    return validationMiss;
  }
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const dailies = await SquareOrderDailyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: keys },
  })
    .lean()
    .exec();
  const byKey = new Map(dailies.map((d) => [d.businessDateKey, d]));
  const missingBusinessDateKeys = keys.filter((k) => !byKey.has(k));
  if (missingBusinessDateKeys.length > 0) {
    logger.debug(
      "rollup read: daily partial — missing SquareOrderDailyRollup rows treated as zero",
      {
        locationMongoId,
        missingCount: missingBusinessDateKeys.length,
        missingBusinessDateKeys,
        foundRowCount: dailies.length,
        expectedBucketCount: keys.length,
      },
    );
  }
  return buildDailySeriesFromDocs(keys, byKey);
}

function pairedDailyComparisonResult(
  comparison: { range: TimeRange; keys: string[] } | null,
  byKey: Map<string, { netSalesCents?: number | null; transactionCount?: number | null }>,
): RollupTimeSeriesResult | null {
  if (!comparison) return null;
  if (comparison.keys.length === 0) {
    return miss("EMPTY_BUCKET_KEYS", "No chart bucket keys for daily rollup read");
  }
  return buildDailySeriesFromDocs(comparison.keys, byKey);
}

/**
 * Batched daily rollup probe for a pair of ranges (typically current +
 * comparison). Issues ONE Mongo `find` with the union of date keys, then
 * splits results per range. Halves Mongo round-trips on the rollup-hit path
 * and reduces query count even when rollups are missing.
 */
export async function tryGetOrderTimeSeriesFromDailyRollupsPair(
  locationMongoId: string,
  current: { range: TimeRange; keys: string[] },
  comparison: { range: TimeRange; keys: string[] } | null,
  timezone: string,
  businessStartTime: string,
): Promise<{ current: RollupTimeSeriesResult; comparison: RollupTimeSeriesResult | null }> {
  const cmpEmpty = miss(
    "EMPTY_BUCKET_KEYS",
    "No chart bucket keys for daily rollup read",
  );
  if (!ROLLUP_READ_ENABLED) {
    const m = miss(
      "ROLLUP_READ_DISABLED",
      "Rollup reads disabled (set ROLLUP_READ_ENABLED=false or env unset)",
    );
    return { current: m, comparison: comparison ? m : null };
  }
  if (current.keys.length === 0) {
    return { current: cmpEmpty, comparison: comparison ? cmpEmpty : null };
  }
  const curValidation = validateDailyKeys(
    current.range,
    timezone,
    businessStartTime,
    current.keys,
  );
  const cmpValidation =
    comparison && comparison.keys.length > 0
      ? validateDailyKeys(comparison.range, timezone, businessStartTime, comparison.keys)
      : null;

  if (curValidation || cmpValidation) {
    const curFallback = curValidation
      ? Promise.resolve<RollupTimeSeriesResult>(curValidation)
      : tryGetOrderTimeSeriesFromDailyRollups(
          locationMongoId,
          current.range,
          timezone,
          businessStartTime,
          current.keys,
        );
    const cmpFallback = (async (): Promise<RollupTimeSeriesResult | null> => {
      if (!comparison) return null;
      if (cmpValidation) return cmpValidation;
      return tryGetOrderTimeSeriesFromDailyRollups(
        locationMongoId,
        comparison.range,
        timezone,
        businessStartTime,
        comparison.keys,
      );
    })();
    const [cur, cmp] = await Promise.all([curFallback, cmpFallback]);
    return { current: cur, comparison: cmp };
  }

  const unionKeys =
    comparison && comparison.keys.length > 0
      ? Array.from(new Set([...current.keys, ...comparison.keys]))
      : current.keys;
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const dailies = await SquareOrderDailyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: unionKeys },
  })
    .lean()
    .exec();
  const byKey = new Map(dailies.map((d) => [d.businessDateKey, d]));

  return {
    current: buildDailySeriesFromDocs(current.keys, byKey),
    comparison: pairedDailyComparisonResult(comparison, byKey),
  };
}

function buildPeriodSeriesFromDocs(
  keys: string[],
  byPk: Map<string, { netSalesCents?: number | null; transactionCount?: number | null }>,
): RollupTimeSeriesHit {
  return hitSeries(
    keys.map((k) => {
      const d = byPk.get(k);
      return d ? (d.netSalesCents ?? 0) / 100 : 0;
    }),
    keys.map((k) => {
      const d = byPk.get(k);
      return d ? (d.transactionCount ?? 0) : 0;
    }),
  );
}

/**
 * Batched period rollup probe for a pair of ranges. Single Mongo find with the
 * union of period keys (under the same granularity).
 */
export async function tryGetOrderTimeSeriesFromPeriodRollupsPair(
  locationMongoId: string,
  granularity: "week" | "month",
  current: { keys: string[] },
  comparison: { keys: string[] } | null,
): Promise<{ current: RollupTimeSeriesResult; comparison: RollupTimeSeriesResult | null }> {
  if (!ROLLUP_READ_ENABLED) {
    const m = miss(
      "ROLLUP_READ_DISABLED",
      "Rollup reads disabled (set ROLLUP_READ_ENABLED=false or env unset)",
    );
    return { current: m, comparison: comparison ? m : null };
  }
  if (current.keys.length === 0) {
    const m = miss("EMPTY_BUCKET_KEYS", "No chart bucket keys for period rollup read");
    return { current: m, comparison: comparison ? m : null };
  }
  const unionKeys = comparison && comparison.keys.length > 0
    ? Array.from(new Set([...current.keys, ...comparison.keys]))
    : current.keys;
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const docs = await SquareOrderPeriodRollupModel.find({
    locationId: oid,
    granularity,
    periodKey: { $in: unionKeys },
  })
    .lean()
    .exec();
  const byPk = new Map(docs.map((d) => [d.periodKey, d]));
  let comparisonResult: RollupTimeSeriesResult | null = null;
  if (comparison) {
    comparisonResult =
      comparison.keys.length > 0
        ? buildPeriodSeriesFromDocs(comparison.keys, byPk)
        : miss("EMPTY_BUCKET_KEYS", "No chart bucket keys for period rollup read");
  }
  return {
    current: buildPeriodSeriesFromDocs(current.keys, byPk),
    comparison: comparisonResult,
  };
}

export async function tryGetOrderTimeSeriesFromPeriodRollups(
  locationMongoId: string,
  granularity: "week" | "month",
  keys: string[],
): Promise<RollupTimeSeriesResult> {
  if (!ROLLUP_READ_ENABLED) {
    return miss(
      "ROLLUP_READ_DISABLED",
      "Rollup reads disabled (set ROLLUP_READ_ENABLED=false or env unset)",
    );
  }
  if (keys.length === 0) {
    return miss("EMPTY_BUCKET_KEYS", "No chart bucket keys for period rollup read");
  }
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const docs = await SquareOrderPeriodRollupModel.find({
    locationId: oid,
    granularity,
    periodKey: { $in: keys },
  })
    .lean()
    .exec();
  const byPk = new Map(docs.map((d) => [d.periodKey, d]));
  const missingPeriodKeys = keys.filter((k) => !byPk.has(k));
  if (missingPeriodKeys.length > 0) {
    logger.debug(
      "rollup read: period partial — missing SquareOrderPeriodRollup rows treated as zero",
      {
        locationMongoId,
        periodGranularity: granularity,
        missingCount: missingPeriodKeys.length,
        missingPeriodKeys,
        foundRowCount: docs.length,
        expectedBucketCount: keys.length,
      },
    );
  }
  return hitSeries(
    keys.map((k) => {
      const d = byPk.get(k);
      return d ? (d.netSalesCents ?? 0) / 100 : 0;
    }),
    keys.map((k) => {
      const d = byPk.get(k);
      return d ? (d.transactionCount ?? 0) : 0;
    }),
  );
}

/**
 * Read hourly rollups aligned to sales-trend chart keys (`yyyy-MM-ddTHH` wall-clock).
 */
export async function tryGetOrderTimeSeriesFromHourlyRollupsForKeys(
  locationMongoId: string,
  timezone: string,
  businessStartTime: string,
  chartKeys: string[],
): Promise<RollupTimeSeriesResult> {
  if (!ROLLUP_READ_ENABLED) {
    return miss(
      "ROLLUP_READ_DISABLED",
      "Rollup reads disabled (set ROLLUP_READ_ENABLED=false or env unset)",
    );
  }
  if (chartKeys.length === 0) {
    return miss("EMPTY_BUCKET_KEYS", "No chart bucket keys for hourly rollup read");
  }
  const negKey = {
    locationMongoId,
    granularity: "hourly-keys",
    rangeKey: buildRangeKey(chartKeys),
  };
  const cachedMiss = readRollupNegativeCache(negKey);
  if (cachedMiss) {
    return miss(cachedMiss.code, cachedMiss.reason, { negativeCacheHit: true });
  }
  const tz = timezone.trim() || "UTC";
  const bst = (businessStartTime ?? "00:00").trim() || "00:00";
  const coords: Array<{ chartKey: string; businessDateKey: string; slotIndex: number }> =
    [];
  for (const chartKey of chartKeys) {
    const mapped = mapHourlyChartKeyToRollupSlot(chartKey, tz, bst);
    if (!mapped) {
      logger.debug("rollup read: hourly chart key did not map to business slot", {
        locationMongoId,
        chartKey,
      });
      const m = miss(
        "HOURLY_CHART_KEY_UNMAPPABLE",
        `Could not map wall-clock chart key ${chartKey} to a business date + slot (outside business day or invalid key)`,
        { chartKey, timezone: tz, businessStartTime: bst },
      );
      writeRollupNegativeCache(negKey, m);
      return m;
    }
    coords.push({ chartKey, ...mapped });
  }
  const uniquePairs = new Map<
    string,
    { businessDateKey: string; slotIndex: number }
  >();
  for (const c of coords) {
    uniquePairs.set(`${c.businessDateKey}\t${c.slotIndex}`, {
      businessDateKey: c.businessDateKey,
      slotIndex: c.slotIndex,
    });
  }
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const distinctBusinessDateKeys = Array.from(
    new Set([...uniquePairs.values()].map((p) => p.businessDateKey)),
  );
  // Cheap existence pre-check: avoids composing the expensive $or scan when
  // there are no hourly rollup rows at all for the requested business dates.
  // Index (locationId, businessDateKey) makes `exists` ~1-5 ms.
  const anyExists = await SquareOrderHourlyRollupModel.exists({
    locationId: oid,
    businessDateKey: { $in: distinctBusinessDateKeys },
  });
  if (!anyExists) {
    const m = miss(
      "HOURLY_NO_ROWS_FOR_DATES",
      `No hourly rollup rows exist for the requested business dates (existence pre-check)`,
      {
        distinctBusinessDateCount: distinctBusinessDateKeys.length,
        sampleBusinessDateKeys: distinctBusinessDateKeys.slice(0, 5),
      },
    );
    writeRollupNegativeCache(negKey, m);
    return m;
  }
  const orClause = [...uniquePairs.values()].map((p) => ({
    locationId: oid,
    businessDateKey: p.businessDateKey,
    slotIndex: p.slotIndex,
  }));
  const docs = await SquareOrderHourlyRollupModel.find({ $or: orClause })
    .lean()
    .exec();
  const byPair = new Map<string, { netSalesCents: number; transactionCount: number }>();
  for (const d of docs) {
    const k = `${d.businessDateKey}\t${d.slotIndex}`;
    byPair.set(k, {
      netSalesCents: d.netSalesCents ?? 0,
      transactionCount: d.transactionCount ?? 0,
    });
  }
  if (byPair.size !== uniquePairs.size) {
    const expectedPairs = [...uniquePairs.keys()];
    const missingPairs = expectedPairs.filter((p) => !byPair.has(p));
    const m = miss(
      "HOURLY_MISSING_ROLLUP_ROWS",
      `Expected ${uniquePairs.size} distinct hourly rollup rows, matched ${byPair.size} (run hourly rollup job for gaps)`,
      {
        expectedUniquePairCount: uniquePairs.size,
        matchedPairCount: byPair.size,
        missingPairs,
        sampleMissingPairs: missingPairs.slice(0, 15),
        chartKeyCount: chartKeys.length,
      },
    );
    writeRollupNegativeCache(negKey, m);
    return m;
  }
  const netSales: number[] = [];
  const transactionCount: number[] = [];
  for (const c of coords) {
    const row = byPair.get(`${c.businessDateKey}\t${c.slotIndex}`);
    if (!row) {
      const m = miss(
        "HOURLY_SLOT_ROW_MISSING",
        `Hourly rollup row missing for ${c.businessDateKey} slot ${c.slotIndex} (unexpected)`,
        {
          chartKey: c.chartKey,
          businessDateKey: c.businessDateKey,
          slotIndex: c.slotIndex,
        },
      );
      writeRollupNegativeCache(negKey, m);
      return m;
    }
    netSales.push(row.netSalesCents / 100);
    transactionCount.push(row.transactionCount);
  }
  return hitSeries(netSales, transactionCount);
}

async function fetchHourlyRollupSourcesBySlotPairs(
  locationMongoId: string,
  pairs: Array<{ businessDateKey: string; slotIndex: number }>,
): Promise<Map<string, { sourcesOfSales: unknown[] }> | null> {
  if (pairs.length === 0) return null;
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const orClause = pairs.map((p) => ({
    locationId: oid,
    businessDateKey: p.businessDateKey,
    slotIndex: p.slotIndex,
  }));
  const docs = await SquareOrderHourlyRollupModel.find({ $or: orClause })
    .lean()
    .exec();
  const byPair = hourlyRollupDocsToSourcesByPairMap(docs);
  return byPair.size === pairs.length ? byPair : null;
}

async function tryOrderTimeSeriesBySourceFromHourlyRollups(
  locationMongoId: string,
  timezone: string,
  businessStartTime: string,
  chartKeys: string[],
): Promise<Record<string, Record<string, number>> | null> {
  const coords = buildHourlyChartCoordsOrNull(
    chartKeys,
    timezone,
    businessStartTime,
  );
  if (!coords) return null;
  const uniquePairs = uniqueHourlySlotPairsFromCoords(coords);
  const byPair = await fetchHourlyRollupSourcesBySlotPairs(
    locationMongoId,
    [...uniquePairs.values()],
  );
  if (!byPair) return null;
  return mergeHourlySourcesIntoBySourceAndChartKey(coords, byPair, chartKeys);
}

async function tryOrderTimeSeriesBySourceFromDailyRollupsForKeys(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  bucketKeys: string[],
): Promise<Record<string, Record<string, number>> | null> {
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  for (const k of bucketKeys) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return null;
    if (!dailyBusinessKeyFullyInRange(k, range, timezone, businessStartTime)) {
      return null;
    }
  }
  const dailies = await SquareOrderDailyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: bucketKeys },
  })
    .lean()
    .exec();
  const byKey = new Map(dailies.map((d) => [d.businessDateKey, d]));
  const bySourceAndKey = aggregateSourcesOfSalesBySourceAndBucketKeys(
    bucketKeys,
    (k) => byKey.get(k)?.sourcesOfSales,
  );
  return Object.keys(bySourceAndKey).length === 0 ? null : bySourceAndKey;
}

/** Net sales dollars per source id per bucket key (for stacked by-source chart). */
export async function tryGetOrderTimeSeriesBySourceFromRollups(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  granularity: SalesTrendGranularity,
  keys: string[],
): Promise<Record<string, Record<string, number>> | null> {
  if (!ROLLUP_READ_ENABLED) return null;
  if (granularity === "hourly") {
    return tryOrderTimeSeriesBySourceFromHourlyRollups(
      locationMongoId,
      timezone,
      businessStartTime,
      keys,
    );
  }
  if (granularity === "daily") {
    return tryOrderTimeSeriesBySourceFromDailyRollupsForKeys(
      locationMongoId,
      range,
      timezone,
      businessStartTime,
      keys,
    );
  }
  if (granularity === "weekly") {
    return tryGetOrderTimeSeriesBySourceFromPeriodRollups(
      locationMongoId,
      "week",
      keys,
    );
  }
  if (granularity === "monthly") {
    return tryGetOrderTimeSeriesBySourceFromPeriodRollups(
      locationMongoId,
      "month",
      keys,
    );
  }
  return null;
}

async function tryGetOrderTimeSeriesBySourceFromPeriodRollups(
  locationMongoId: string,
  granularity: "week" | "month",
  keys: string[],
): Promise<Record<string, Record<string, number>> | null> {
  if (!ROLLUP_READ_ENABLED || keys.length === 0) return null;
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const docs = await SquareOrderPeriodRollupModel.find({
    locationId: oid,
    granularity,
    periodKey: { $in: keys },
  })
    .lean()
    .exec();
  const byPk = new Map(docs.map((d) => [d.periodKey, d]));
  const bySourceAndKey = aggregateSourcesOfSalesBySourceAndBucketKeys(
    keys,
    (k) => byPk.get(k)?.sourcesOfSales,
  );
  return Object.keys(bySourceAndKey).length === 0 ? null : bySourceAndKey;
}

/**
 * Batched dispatcher: probe current + comparison ranges in a single Mongo
 * round-trip for daily / weekly / monthly granularities. Hourly is not
 * batched here because its shape differs (per-slot fan-out) and is handled
 * separately via {@link tryGetOrderTimeSeriesFromHourlyRollupsForKeys}.
 */
export async function tryGetOrderTimeSeriesFromRollupsPair(
  locationMongoId: string,
  granularity: SalesTrendGranularity,
  timezone: string,
  businessStartTime: string,
  current: { range: TimeRange; keys: string[] },
  comparison: { range: TimeRange; keys: string[] } | null,
): Promise<{ current: RollupTimeSeriesResult; comparison: RollupTimeSeriesResult | null }> {
  if (granularity === "hourly") {
    const [cur, cmp] = await Promise.all([
      tryGetOrderTimeSeriesFromHourlyRollupsForKeys(
        locationMongoId,
        timezone,
        businessStartTime,
        current.keys,
      ),
      comparison
        ? tryGetOrderTimeSeriesFromHourlyRollupsForKeys(
            locationMongoId,
            timezone,
            businessStartTime,
            comparison.keys,
          )
        : Promise.resolve(null),
    ]);
    return { current: cur, comparison: cmp };
  }
  if (granularity === "daily") {
    return tryGetOrderTimeSeriesFromDailyRollupsPair(
      locationMongoId,
      current,
      comparison,
      timezone,
      businessStartTime,
    );
  }
  if (granularity === "weekly") {
    return tryGetOrderTimeSeriesFromPeriodRollupsPair(
      locationMongoId,
      "week",
      current,
      comparison,
    );
  }
  if (granularity === "monthly") {
    return tryGetOrderTimeSeriesFromPeriodRollupsPair(
      locationMongoId,
      "month",
      current,
      comparison,
    );
  }
  const m = miss(
    "UNSUPPORTED_GRANULARITY",
    `Unsupported granularity for paired rollup read: ${granularity}`,
  );
  return { current: m, comparison: comparison ? m : null };
}

export async function tryGetOrderTimeSeriesFromRollups(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  granularity: SalesTrendGranularity,
  keys: string[],
): Promise<RollupTimeSeriesResult> {
  if (granularity === "hourly") {
    return tryGetOrderTimeSeriesFromHourlyRollupsForKeys(
      locationMongoId,
      timezone,
      businessStartTime,
      keys,
    );
  }
  if (granularity === "daily") {
    return tryGetOrderTimeSeriesFromDailyRollups(
      locationMongoId,
      range,
      timezone,
      businessStartTime,
      keys,
    );
  }
  if (granularity === "weekly") {
    return tryGetOrderTimeSeriesFromPeriodRollups(
      locationMongoId,
      "week",
      keys,
    );
  }
  if (granularity === "monthly") {
    return tryGetOrderTimeSeriesFromPeriodRollups(
      locationMongoId,
      "month",
      keys,
    );
  }
  return miss(
    "UNSUPPORTED_GRANULARITY",
    `No rollup reader for granularity: ${String(granularity)}`,
    { granularity },
  );
}

export async function tryGetSquareOrderPeriodRollup(
  locationMongoId: string,
  granularity: "week" | "month" | "year",
  periodKey: string,
): Promise<{
  netSalesCents: number;
  transactionCount: number;
  totalDiscountCents: number;
  totalRefundCents: number;
  refundCount: number;
  sourcesOfSales: unknown[];
} | null> {
  if (!ROLLUP_READ_ENABLED) return null;
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const doc = await SquareOrderPeriodRollupModel.findOne({
    locationId: oid,
    granularity,
    periodKey,
  })
    .lean()
    .exec();
  if (!doc) return null;
  return {
    netSalesCents: doc.netSalesCents,
    transactionCount: doc.transactionCount,
    totalDiscountCents: doc.totalDiscountCents,
    totalRefundCents: doc.totalRefundCents,
    refundCount: doc.refundCount,
    sourcesOfSales: doc.sourcesOfSales ?? [],
  };
}

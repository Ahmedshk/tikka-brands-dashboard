/**
 * Rollup-first reads for Square order aggregates (daily + hourly + period).
 */
import mongoose from "mongoose";
import { SquareOrderDailyRollupModel } from "../models/squareOrderDailyRollup.model.js";
import { SquareOrderHourlyRollupModel } from "../models/squareOrderHourlyRollup.model.js";
import { SquareOrderPeriodRollupModel } from "../models/squareOrderPeriodRollup.model.js";
import {
  businessDateKeysIntersectingUtcRange,
  businessDayUtcRangeIsoStrings,
} from "../utils/businessDayUtcRange.util.js";
import type { SalesTrendGranularity } from "../utils/homebaseOrderedBuckets.util.js";
import type { TimeRange } from "../utils/businessHours.util.js";
import type { SourcesOfSalesSegment } from "./square.service.js";
import { logger } from "../utils/logger.util.js";
import { mergeSourcesOfSalesFromDailyRollupDocs } from "../utils/squareSourcesOfSalesMerge.util.js";

const ROLLUP_READ_ENABLED =
  (process.env.ROLLUP_READ_ENABLED ?? "true").trim().toLowerCase() !== "false";

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
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const hourly = await SquareOrderHourlyRollupModel.find({
    locationId: oid,
    businessDateKey,
  })
    .sort({ slotIndex: 1 })
    .lean()
    .exec();
  if (hourly.length !== 24) return null;
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

/** All `keys` must be yyyy-MM-dd business dates fully contained in `range`. */
export async function tryGetOrderTimeSeriesFromDailyRollups(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  keys: string[],
): Promise<{ netSales: number[]; transactionCount: number[] } | null> {
  if (!ROLLUP_READ_ENABLED) return null;
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  for (const k of keys) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return null;
    if (!dailyBusinessKeyFullyInRange(k, range, timezone, businessStartTime)) {
      logger.debug("rollup read: daily bucket not fully in range", {
        locationMongoId,
        businessDateKey: k,
      });
      return null;
    }
  }
  if (keys.length === 0) return null;
  const dailies = await SquareOrderDailyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: keys },
  })
    .lean()
    .exec();
  if (dailies.length !== keys.length) return null;
  const byKey = new Map(dailies.map((d) => [d.businessDateKey, d]));
  const netSales: number[] = [];
  const transactionCount: number[] = [];
  for (const k of keys) {
    const d = byKey.get(k);
    if (!d) return null;
    netSales.push((d.netSalesCents ?? 0) / 100);
    transactionCount.push(d.transactionCount ?? 0);
  }
  return { netSales, transactionCount };
}

export async function tryGetOrderTimeSeriesFromPeriodRollups(
  locationMongoId: string,
  granularity: "week" | "month",
  keys: string[],
): Promise<{ netSales: number[]; transactionCount: number[] } | null> {
  if (!ROLLUP_READ_ENABLED || keys.length === 0) return null;
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const docs = await SquareOrderPeriodRollupModel.find({
    locationId: oid,
    granularity,
    periodKey: { $in: keys },
  })
    .lean()
    .exec();
  if (docs.length !== keys.length) return null;
  const byPk = new Map(docs.map((d) => [d.periodKey, d]));
  for (const k of keys) {
    if (!byPk.has(k)) return null;
  }
  return {
    netSales: keys.map((k) => (byPk.get(k)!.netSalesCents ?? 0) / 100),
    transactionCount: keys.map((k) => byPk.get(k)!.transactionCount ?? 0),
  };
}

export async function tryGetOrderTimeSeriesFromRollups(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  granularity: SalesTrendGranularity,
  keys: string[],
): Promise<{ netSales: number[]; transactionCount: number[] } | null> {
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
  return null;
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

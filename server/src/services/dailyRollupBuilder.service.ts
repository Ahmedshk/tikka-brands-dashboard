/**
 * Idempotent daily rollups per location (MarketMan: per buyerGuid + apiKind).
 * Business day key: `yyyy-MM-dd` = calendar date in location TZ when the **business day opens**
 * (at businessStartTime). UTC window: `getBusinessDayRangeForDate` (business start → next business start − 1s).
 *
 * MarketMan: counts orders whose `businessDateAt` falls in that same UTC window.
 */
import mongoose from "mongoose";
import { SquareOrderDailyRollupModel } from "../models/squareOrderDailyRollup.model.js";
import { SquarePaymentDailyRollupModel } from "../models/squarePaymentDailyRollup.model.js";
import { HomebaseTimecardDailyRollupModel } from "../models/homebaseTimecardDailyRollup.model.js";
import { MarketManOrderCacheModel } from "../models/marketmanOrderCache.model.js";
import { MarketManOrderDailyRollupModel } from "../models/marketmanOrderDailyRollup.model.js";
import { SquarePaymentModel } from "../models/squarePayment.model.js";
import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import type { TimeRange } from "../utils/businessHours.util.js";
import { businessDayUtcRangeIsoStrings } from "../utils/businessDayUtcRange.util.js";
import {
  getOrderStatsFromOrders,
  getSourcesOfSalesFromOrders,
} from "./square.service.js";
import {
  loadHomebaseTimecardsForMongoRange,
  loadSquareOrdersForMongoRange,
} from "./integrationCacheRead.service.js";
import {
  getSquarePaymentAmountCentsFromRaw,
  getSquarePaymentStatusFromRaw,
  isSquarePaymentCountedInDailyRollup,
} from "../utils/squarePaymentMongoIndexFields.util.js";
import type { HomebaseTimecard } from "./homebase.service.js";

export function timeRangeForBusinessDateKey(
  timezone: string,
  businessStartTime: string,
  businessDateKey: string,
): TimeRange {
  return businessDayUtcRangeIsoStrings(
    timezone,
    businessStartTime,
    businessDateKey,
  );
}

function sumHomebaseLaborMetrics(cards: HomebaseTimecard[]): {
  totalLaborCost: number;
  totalPaidHours: number;
} {
  let totalLaborCost = 0;
  let totalPaidHours = 0;
  for (const tc of cards) {
    const costs = tc.labor?.costs;
    if (typeof costs === "number" && Number.isFinite(costs)) {
      totalLaborCost += costs;
    }
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
    totalPaidHours += hours;
  }
  return { totalLaborCost, totalPaidHours };
}

export async function buildSquareOrderRollupForDay(
  locationMongoId: string,
  businessDateKey: string,
  timezone: string,
  businessStartTime: string,
): Promise<void> {
  const range = timeRangeForBusinessDateKey(
    timezone,
    businessStartTime,
    businessDateKey,
  );
  const orders = await loadSquareOrdersForMongoRange(locationMongoId, range);
  const stats = getOrderStatsFromOrders(orders);
  const sourcesOfSales = getSourcesOfSalesFromOrders(orders);
  const computedAt = new Date();
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  await SquareOrderDailyRollupModel.replaceOne(
    { locationId: oid, businessDateKey },
    {
      locationId: oid,
      businessDateKey,
      computedAt,
      netSalesCents: stats.netSalesCents,
      transactionCount: stats.orderCount,
      totalDiscountCents: stats.totalDiscountCents,
      totalRefundCents: stats.totalRefundCents,
      refundCount: stats.refundCount,
      sourcesOfSales,
    },
    { upsert: true },
  ).exec();
}

/** Same inclusion rules as `buildSquarePaymentRollupForDay` (parity / scripts). */
export async function computeSquarePaymentMetricsForRange(
  locationMongoId: string,
  range: TimeRange,
): Promise<{ paymentCount: number; totalAmountCents: number }> {
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const startD = new Date(range.startAt);
  const endD = new Date(range.endAt);
  const docs = await SquarePaymentModel.find({
    locationId: oid,
    paymentCreatedAt: { $gte: startD, $lte: endD },
  })
    .select({ raw: 1, paymentStatus: 1 })
    .lean()
    .exec();

  let paymentCount = 0;
  let totalAmountCents = 0;
  for (const d of docs) {
    const raw = d.raw as Record<string, unknown>;
    const status =
      typeof d.paymentStatus === "string" && d.paymentStatus.trim().length > 0
        ? d.paymentStatus.trim()
        : getSquarePaymentStatusFromRaw(raw);
    if (!isSquarePaymentCountedInDailyRollup(status)) continue;
    const cents = getSquarePaymentAmountCentsFromRaw(raw);
    if (cents == null || !Number.isFinite(cents)) continue;
    paymentCount += 1;
    totalAmountCents += cents;
  }
  return { paymentCount, totalAmountCents };
}

export async function buildSquarePaymentRollupForDay(
  locationMongoId: string,
  businessDateKey: string,
  timezone: string,
  businessStartTime: string,
): Promise<void> {
  const range = timeRangeForBusinessDateKey(
    timezone,
    businessStartTime,
    businessDateKey,
  );
  const { paymentCount, totalAmountCents } =
    await computeSquarePaymentMetricsForRange(locationMongoId, range);
  const computedAt = new Date();
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  await SquarePaymentDailyRollupModel.replaceOne(
    { locationId: oid, businessDateKey },
    {
      locationId: oid,
      businessDateKey,
      computedAt,
      paymentCount,
      totalAmountCents,
    },
    { upsert: true },
  ).exec();
}

export async function buildHomebaseRollupForDay(
  locationMongoId: string,
  businessDateKey: string,
  timezone: string,
  businessStartTime: string,
): Promise<void> {
  const range = timeRangeForBusinessDateKey(
    timezone,
    businessStartTime,
    businessDateKey,
  );
  const cards = await loadHomebaseTimecardsForMongoRange(
    locationMongoId,
    range,
  );
  const { totalLaborCost, totalPaidHours } = sumHomebaseLaborMetrics(cards);
  const computedAt = new Date();
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  await HomebaseTimecardDailyRollupModel.replaceOne(
    { locationId: oid, businessDateKey },
    {
      locationId: oid,
      businessDateKey,
      computedAt,
      totalLaborCost,
      totalPaidHours,
    },
    { upsert: true },
  ).exec();
}

export async function countMarketManOrdersForBusinessDay(
  locationMongoId: string,
  buyerGuid: string,
  apiKind: MarketManOrderApiKind,
  businessDateKey: string,
  timezone: string,
  businessStartTime: string,
): Promise<number> {
  const range = timeRangeForBusinessDateKey(
    timezone,
    businessStartTime,
    businessDateKey,
  );
  const startD = new Date(range.startAt);
  const endD = new Date(range.endAt);
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const bg = buyerGuid.trim();
  const count = await MarketManOrderCacheModel.countDocuments({
    locationId: oid,
    buyerGuid: bg,
    apiKind,
    businessDateAt: { $gte: startD, $lte: endD },
  }).exec();
  return count;
}

export async function buildMarketManRollupForDay(
  locationMongoId: string,
  buyerGuid: string,
  apiKind: MarketManOrderApiKind,
  businessDateKey: string,
  timezone: string,
  businessStartTime: string,
): Promise<void> {
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const bg = buyerGuid.trim();
  const orderCount = await countMarketManOrdersForBusinessDay(
    locationMongoId,
    bg,
    apiKind,
    businessDateKey,
    timezone,
    businessStartTime,
  );
  const computedAt = new Date();
  await MarketManOrderDailyRollupModel.replaceOne(
    { locationId: oid, buyerGuid: bg, apiKind, businessDateKey },
    {
      locationId: oid,
      buyerGuid: bg,
      apiKind,
      businessDateKey,
      computedAt,
      orderCount,
    },
    { upsert: true },
  ).exec();
}

/**
 * Square order rollups: hourly slots + week/month/year period aggregates from daily docs.
 */
import mongoose from "mongoose";
import { SquareOrderDailyRollupModel } from "../models/squareOrderDailyRollup.model.js";
import { SquareOrderHourlyRollupModel } from "../models/squareOrderHourlyRollup.model.js";
import {
  SquareOrderPeriodRollupModel,
  type SquareOrderPeriodGranularity,
} from "../models/squareOrderPeriodRollup.model.js";
import {
  getBusinessHourIndexForBusinessDateKey,
} from "../utils/businessDayUtcRange.util.js";
import { mergeCategoryBreakdownFromDailyRollupDocs } from "../utils/squareCategoryRollupBreakdown.util.js";
import { mergeSourcesOfSalesFromDailyRollupDocs } from "../utils/squareSourcesOfSalesMerge.util.js";
import {
  addCentsToSourcesOfSalesCentsById,
  sourcesOfSalesFactsFromCentsById,
} from "../utils/sourcesOfSalesFacts.util.js";
import { deriveSquareSourcesOfSalesKey } from "../utils/squareSourcesOfSalesKey.util.js";
import {
  businessDateKeysForMonthPeriod,
  businessDateKeysForWeekPeriod,
  businessDateKeysForYearPeriod,
  sundayWeekStartYmdForBusinessDateKey,
  monthPeriodKeyFromBusinessDateKey,
  yearPeriodKeyFromBusinessDateKey,
} from "../utils/rollupPeriodKeys.util.js";
import {
  filterSquareOrdersForDashboardDisplay,
  getSquareOrderCreatedAtMsFromRaw,
} from "../utils/squareOrderCacheHelpers.js";
import {
  isOrderCountedForNetSales,
  orderNetSalesCents,
} from "./square.service.js";
import { loadSquareOrdersForMongoRange } from "./integrationCacheRead.service.js";
import { timeRangeForBusinessDateKey } from "./dailyRollupBuilder.service.js";

export async function buildSquareOrderHourlyRollupsForDay(
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
  const bySlot: Array<{
    netCents: number;
    txCount: number;
    centsBySourceId: Map<string, number>;
  }> = Array.from({ length: 24 }, () => ({
    netCents: 0,
    txCount: 0,
    centsBySourceId: new Map<string, number>(),
  }));
  for (const order of filterSquareOrdersForDashboardDisplay(orders)) {
    const raw = order as unknown as Record<string, unknown>;
    const ms = getSquareOrderCreatedAtMsFromRaw(raw);
    if (ms == null) continue;
    const iso = new Date(ms).toISOString();
    const slot = getBusinessHourIndexForBusinessDateKey(
      iso,
      timezone,
      businessStartTime,
      businessDateKey,
    );
    if (slot < 0 || slot >= bySlot.length) continue;
    const bucket = bySlot[slot];
    if (bucket === undefined) continue;
    if (!isOrderCountedForNetSales(order)) continue;
    const netCents = orderNetSalesCents(order);
    bucket.netCents += netCents;
    if (netCents > 0) {
      bucket.txCount += 1;
      addCentsToSourcesOfSalesCentsById(
        bucket.centsBySourceId,
        deriveSquareSourcesOfSalesKey(order),
        netCents,
      );
    }
  }
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const computedAt = new Date();
  for (let slotIndex = 0; slotIndex < 24; slotIndex++) {
    const bucket = bySlot[slotIndex];
    if (bucket === undefined) {
      throw new Error(
        `Invariant: hourly rollup bucket missing at index ${slotIndex}`,
      );
    }
    await SquareOrderHourlyRollupModel.replaceOne(
      { locationId: oid, businessDateKey, slotIndex },
      {
        locationId: oid,
        businessDateKey,
        slotIndex,
        computedAt,
        netSalesCents: bucket.netCents,
        transactionCount: bucket.txCount,
        sourcesOfSales: sourcesOfSalesFactsFromCentsById(bucket.centsBySourceId),
      },
      { upsert: true },
    ).exec();
  }
}

async function sumSquareOrderDailiesIntoPeriodRollup(
  locationMongoId: string,
  granularity: SquareOrderPeriodGranularity,
  periodKey: string,
  businessDateKeys: string[],
): Promise<void> {
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const dailies = await SquareOrderDailyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: businessDateKeys },
  })
    .lean()
    .exec();
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
  const sourcesOfSales = mergeSourcesOfSalesFromDailyRollupDocs(dailies);
  const categoriesBreakdown =
    mergeCategoryBreakdownFromDailyRollupDocs(dailies);
  const computedAt = new Date();
  await SquareOrderPeriodRollupModel.replaceOne(
    { locationId: oid, granularity, periodKey },
    {
      locationId: oid,
      granularity,
      periodKey,
      computedAt,
      netSalesCents,
      transactionCount,
      totalDiscountCents,
      totalRefundCents,
      refundCount,
      sourcesOfSales,
      categoriesBreakdown,
    },
    { upsert: true },
  ).exec();
}

export async function rebuildSquareOrderPeriodRollupsForBusinessDateKey(
  locationMongoId: string,
  businessDateKey: string,
  timezone: string,
): Promise<void> {
  const tz = timezone.trim() || "UTC";
  const weekStart = sundayWeekStartYmdForBusinessDateKey(businessDateKey, tz);
  const weekKeys = businessDateKeysForWeekPeriod(weekStart, tz);
  await sumSquareOrderDailiesIntoPeriodRollup(
    locationMongoId,
    "week",
    weekStart,
    weekKeys,
  );
  const monthKey = monthPeriodKeyFromBusinessDateKey(businessDateKey);
  const monthKeys = businessDateKeysForMonthPeriod(monthKey, tz);
  await sumSquareOrderDailiesIntoPeriodRollup(
    locationMongoId,
    "month",
    monthKey,
    monthKeys,
  );
  const yearKey = yearPeriodKeyFromBusinessDateKey(businessDateKey);
  const yearKeys = businessDateKeysForYearPeriod(yearKey, tz);
  await sumSquareOrderDailiesIntoPeriodRollup(
    locationMongoId,
    "year",
    yearKey,
    yearKeys,
  );
}

export async function rebuildSquareOrderDerivedRollupsForBusinessDay(
  locationMongoId: string,
  businessDateKey: string,
  timezone: string,
  businessStartTime: string,
): Promise<void> {
  await buildSquareOrderHourlyRollupsForDay(
    locationMongoId,
    businessDateKey,
    timezone,
    businessStartTime,
  );
  await rebuildSquareOrderPeriodRollupsForBusinessDateKey(
    locationMongoId,
    businessDateKey,
    timezone,
  );
}

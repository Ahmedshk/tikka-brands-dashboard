import mongoose from "mongoose";
import { SquareOrderModel } from "../models/squareOrder.model.js";
import { HomebaseTimecardModel } from "../models/homebaseTimecard.model.js";
import {
  getOrderStatsFromOrders,
  getSourcesOfSalesFromOrders,
  isOrderCountedForNetSales,
  orderNetSalesCents,
  squareOrdersToWithDiscounts,
  type SquareServiceOptions,
  type SquareOrder,
} from "./square.service.js";
import { SquarePaymentModel } from "../models/squarePayment.model.js";
import { SquareTeamMemberModel } from "../models/squareTeamMember.model.js";
import { SquareCatalogObjectModel } from "../models/squareCatalogObject.model.js";
import type { TimeRange } from "../utils/businessHours.util.js";
import type { OrderInRange } from "../utils/squareOrderSearchHelpers.js";
import type {
  HomebaseTimecard,
  LaborHoursTimeSeriesResult,
} from "./homebase.service.js";
import {
  getOrderedBucketsAndLabels,
  type GetOrderedBucketsAndLabelsOptions,
  type SalesTrendGranularity,
} from "../utils/homebaseOrderedBuckets.util.js";
import { aggregateTimecardsIntoBuckets } from "../utils/homebaseTimeSeriesHelpers.js";
import { computeLaborCostPerHourFromTimecards } from "../utils/homebaseLaborHelpers.js";
import { getBusinessHourIndex } from "../utils/businessDayUtcRange.util.js";
import type {
  BatchRetrieveCatalogFn,
  CatalogObjectForCategory,
} from "../utils/squareNetSalesByCategoryHelpers.js";
import {
  getSquareOrderCreatedAtMsFromRaw,
  filterSquareOrdersForDashboardDisplay,
} from "../utils/squareOrderCacheHelpers.js";
import {
  tryGetHourlyNetSalesCentsBySlotFromRollups,
  tryGetLaborTotalsFromDailyRollupsSplit,
  tryGetOrderStatsAndSourcesFromDailyRollupsSplit,
} from "./integrationRollupRead.service.js";
import { logger } from "../utils/logger.util.js";
import { squareRawIdAsString } from "../utils/squareRawIdString.util.js";
import {
  loadSquareOrdersForMongoRangeCached,
  primeOrderRangeCache,
} from "../utils/orderRangeCache.util.js";
import {
  loadHomebaseTimecardsForMongoRangeCached,
  primeTimecardRangeCache,
} from "../utils/timecardRangeCache.util.js";
import {
  sumLaborCostAcrossSubRanges,
  sumNetSalesCentsAcrossSubRanges,
  sumOrderStatsAndSourcesAcrossSubRanges,
  sumTotalHoursAcrossSubRanges,
} from "../utils/rollupSplitScan.util.js";
import {
  mergeCentsByIdInto,
  renderSourcesOfSalesSegmentsFromCentsById,
} from "../utils/squareSourcesOfSalesMerge.util.js";
import {
  logSplitRangeMiss,
  logSplitRangeReadOutcome,
} from "../utils/splitRangeReadLogging.util.js";

/** Square Payment `amount_money` / `tip_money` shape from cached `raw`. */
type SquarePaymentMoneyField =
  | { amount?: bigint | number | string }
  | undefined;

export async function loadSquareOrdersForMongoRange(
  locationMongoId: string,
  range: TimeRange,
): Promise<SquareOrder[]> {
  return loadSquareOrdersForMongoRangeCached(
    locationMongoId,
    { startAt: range.startAt, endAt: range.endAt },
    async () => {
      const oid = new mongoose.Types.ObjectId(locationMongoId);
      const startD = new Date(range.startAt);
      const endD = new Date(range.endAt);
      const docs = await SquareOrderModel.find({
        locationId: oid,
        excludedFromDashboard: false,
        squareCreatedAt: { $gte: startD, $lte: endD },
      })
        .select({ raw: 1 })
        .lean()
        .exec();
      return docs.map((d) => d.raw as SquareOrder);
    },
  );
}

/**
 * Bulk variant of {@link loadSquareOrdersForMongoRange}.
 *
 * Issues a single Mongo `find` covering all `locationMongoIds` × the union
 * `range`, then buckets results per location and primes the
 * {@link primeOrderRangeCache | order range cache} for **each provided
 * sub-range** so subsequent per-location `loadSquareOrdersForMongoRange`
 * calls become in-process cache hits.
 *
 * Why bulk: per-query latency to Atlas dominates the read path (~240ms on
 * M10) while server-side `IXSCAN` cost is ~0ms. Collapsing 9 round-trips
 * into 1 is a 9x latency win when there's nothing else to overlap with.
 */
export async function bulkPrefetchSquareOrdersForLocations(params: {
  locationMongoIds: readonly string[];
  unionRange: TimeRange;
  primeRanges: ReadonlyArray<{
    locationMongoId: string;
    range: TimeRange;
  }>;
}): Promise<void> {
  const { locationMongoIds, unionRange, primeRanges } = params;
  if (locationMongoIds.length === 0) return;
  const oids = locationMongoIds.map((id) => new mongoose.Types.ObjectId(id));
  const unionStartD = new Date(unionRange.startAt);
  const unionEndD = new Date(unionRange.endAt);
  const docs = await SquareOrderModel.find({
    locationId: { $in: oids },
    excludedFromDashboard: false,
    squareCreatedAt: { $gte: unionStartD, $lte: unionEndD },
  })
    .select({ raw: 1, locationId: 1, squareCreatedAt: 1 })
    .lean()
    .exec();
  // Bucket per location, keeping `squareCreatedAt` alongside `raw` so we can
  // filter to sub-ranges without re-parsing the raw payload.
  type Indexed = { raw: SquareOrder; ts: number };
  const byLocation = new Map<string, Indexed[]>();
  for (const id of locationMongoIds) byLocation.set(id, []);
  for (const d of docs) {
    const typed = d as {
      raw: SquareOrder;
      locationId: mongoose.Types.ObjectId;
      squareCreatedAt: Date | null;
    };
    const lid = typed.locationId.toString();
    const bucket = byLocation.get(lid);
    if (!bucket) continue;
    const ts = typed.squareCreatedAt ? typed.squareCreatedAt.getTime() : Number.NaN;
    bucket.push({ raw: typed.raw, ts });
  }
  // For each requested (location, range), slice the prefetch to that range
  // and prime the cache. Same predicate Mongo used, so the cached array is
  // identical to what a per-range query would return.
  for (const { locationMongoId, range } of primeRanges) {
    const all = byLocation.get(locationMongoId) ?? [];
    const rangeStartMs = new Date(range.startAt).getTime();
    const rangeEndMs = new Date(range.endAt).getTime();
    const filtered =
      rangeStartMs === unionStartD.getTime() &&
      rangeEndMs === unionEndD.getTime()
        ? all.map((i) => i.raw)
        : all
            .filter((i) => i.ts >= rangeStartMs && i.ts <= rangeEndMs)
            .map((i) => i.raw);
    primeOrderRangeCache(
      locationMongoId,
      { startAt: range.startAt, endAt: range.endAt },
      filtered,
    );
  }
}

export interface RollupReadContext {
  timezone: string;
  businessStartTime: string;
}

export async function getNetSalesDollarsInRangeFromCache(
  locationMongoId: string,
  range: TimeRange,
  rollupCtx?: RollupReadContext,
  /** When set, logs whether net sales came from daily rollups or Mongo orders (e.g. command center). */
  logContext?: string,
): Promise<number> {
  if (rollupCtx) {
    const split = await tryGetOrderStatsAndSourcesFromDailyRollupsSplit(
      locationMongoId,
      range,
      rollupCtx.timezone,
      rollupCtx.businessStartTime,
    );
    if (split != null) {
      const scannedCents = await sumNetSalesCentsAcrossSubRanges(
        split.uncoveredRanges,
        (subRange) => loadSquareOrdersForMongoRange(locationMongoId, subRange),
      );
      logSplitRangeReadOutcome(
        logContext,
        "netSalesSource",
        "SquareOrderDailyRollup rows (tryGetOrderStatsAndSourcesFromDailyRollupsSplit)",
        "orders",
        {
          presentKeyCount: split.presentKeys.size,
          uncoveredRangeCount: split.uncoveredRanges.length,
        },
      );
      return (split.rollupNetSalesCents + scannedCents) / 100;
    }
    logSplitRangeMiss(
      logContext,
      "netSalesSource",
      "mongo_orders",
      "rollup miss, ROLLUP_READ_ENABLED off, or zero matching daily Square order rollup rows — summed from Mongo orders",
    );
  } else {
    logSplitRangeMiss(
      logContext,
      "netSalesSource",
      "mongo_orders",
      "no rollup context (timezone / businessStartTime) — summed from Mongo orders",
    );
  }
  const orders = filterSquareOrdersForDashboardDisplay(
    await loadSquareOrdersForMongoRange(locationMongoId, range),
  );
  let cents = 0;
  for (const o of orders) {
    if (!isOrderCountedForNetSales(o)) continue;
    cents += orderNetSalesCents(o);
  }
  return cents / 100;
}

export async function getLaborCostInRangeFromCache(
  locationMongoId: string,
  range: TimeRange,
  rollupCtx?: RollupReadContext,
  /** When set, logs whether labor cost came from daily rollups or raw timecards. */
  logContext?: string,
): Promise<number> {
  if (rollupCtx) {
    const split = await tryGetLaborTotalsFromDailyRollupsSplit(
      locationMongoId,
      range,
      rollupCtx.timezone,
      rollupCtx.businessStartTime,
    );
    if (split != null) {
      const scanned = await sumLaborCostAcrossSubRanges(
        split.uncoveredRanges,
        (subRange) => loadHomebaseTimecardsForMongoRange(locationMongoId, subRange),
      );
      logSplitRangeReadOutcome(
        logContext,
        "laborSource",
        "HomebaseTimecardDailyRollup rows (tryGetLaborTotalsFromDailyRollupsSplit)",
        "timecards",
        {
          presentKeyCount: split.presentKeys.size,
          uncoveredRangeCount: split.uncoveredRanges.length,
        },
      );
      return split.rollupTotalLaborCost + scanned;
    }
    logSplitRangeMiss(
      logContext,
      "laborSource",
      "mongo_homebase_timecards",
      "rollup miss, ROLLUP_READ_ENABLED off, or zero matching daily Homebase timecard rollup rows — summed from synced timecards",
    );
  }
  const cards = await loadHomebaseTimecardsForMongoRange(
    locationMongoId,
    range,
  );
  let total = 0;
  for (const tc of cards) {
    const costs = tc.labor?.costs;
    if (typeof costs === "number" && Number.isFinite(costs)) {
      total += costs;
    }
  }
  return total;
}

export async function getTotalHoursInRangeFromCache(
  locationMongoId: string,
  range: TimeRange,
  rollupCtx?: RollupReadContext,
  /** When set, logs whether hours came from daily rollups or raw timecards. */
  logContext?: string,
): Promise<number> {
  if (rollupCtx) {
    const split = await tryGetLaborTotalsFromDailyRollupsSplit(
      locationMongoId,
      range,
      rollupCtx.timezone,
      rollupCtx.businessStartTime,
    );
    if (split != null) {
      const scanned = await sumTotalHoursAcrossSubRanges(
        split.uncoveredRanges,
        (subRange) => loadHomebaseTimecardsForMongoRange(locationMongoId, subRange),
      );
      logSplitRangeReadOutcome(
        logContext,
        "hoursSource",
        "HomebaseTimecardDailyRollup rows (tryGetLaborTotalsFromDailyRollupsSplit)",
        "timecards",
        {
          presentKeyCount: split.presentKeys.size,
          uncoveredRangeCount: split.uncoveredRanges.length,
        },
      );
      return split.rollupTotalPaidHours + scanned;
    }
    logSplitRangeMiss(
      logContext,
      "hoursSource",
      "mongo_homebase_timecards",
      "rollup miss, ROLLUP_READ_ENABLED off, or zero matching daily Homebase timecard rollup rows — summed from synced timecards",
    );
  }
  const cards = await loadHomebaseTimecardsForMongoRange(
    locationMongoId,
    range,
  );
  let total = 0;
  for (const tc of cards) {
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
    total += hours;
  }
  return total;
}

export async function loadHomebaseTimecardsForMongoRange(
  locationMongoId: string,
  range: TimeRange,
): Promise<HomebaseTimecard[]> {
  return loadHomebaseTimecardsForMongoRangeCached(
    locationMongoId,
    { startAt: range.startAt, endAt: range.endAt },
    async () => {
      const oid = new mongoose.Types.ObjectId(locationMongoId);
      const startD = new Date(range.startAt);
      const endD = new Date(range.endAt);
      const docs = await HomebaseTimecardModel.find({
        locationId: oid,
        clockInAt: { $gte: startD, $lte: endD },
      })
        .select({ raw: 1 })
        .lean()
        .exec();
      return docs.map((d) => d.raw as HomebaseTimecard);
    },
  );
}

/**
 * Bulk variant of {@link loadHomebaseTimecardsForMongoRange}: one Mongo
 * `find` over (locationIds × union range), bucketed per location and
 * primed into the timecard range cache for each requested sub-range.
 * Mirrors {@link bulkPrefetchSquareOrdersForLocations}.
 */
export async function bulkPrefetchHomebaseTimecardsForLocations(params: {
  locationMongoIds: readonly string[];
  unionRange: TimeRange;
  primeRanges: ReadonlyArray<{
    locationMongoId: string;
    range: TimeRange;
  }>;
}): Promise<void> {
  const { locationMongoIds, unionRange, primeRanges } = params;
  if (locationMongoIds.length === 0) return;
  const oids = locationMongoIds.map((id) => new mongoose.Types.ObjectId(id));
  const unionStartD = new Date(unionRange.startAt);
  const unionEndD = new Date(unionRange.endAt);
  const docs = await HomebaseTimecardModel.find({
    locationId: { $in: oids },
    clockInAt: { $gte: unionStartD, $lte: unionEndD },
  })
    .select({ raw: 1, locationId: 1, clockInAt: 1 })
    .lean()
    .exec();
  type Indexed = { raw: HomebaseTimecard; ts: number };
  const byLocation = new Map<string, Indexed[]>();
  for (const id of locationMongoIds) byLocation.set(id, []);
  for (const d of docs) {
    const typed = d as unknown as {
      raw: HomebaseTimecard;
      locationId: mongoose.Types.ObjectId;
      clockInAt: Date | null;
    };
    const lid = typed.locationId.toString();
    const bucket = byLocation.get(lid);
    if (!bucket) continue;
    const ts = typed.clockInAt ? typed.clockInAt.getTime() : Number.NaN;
    bucket.push({ raw: typed.raw, ts });
  }
  for (const { locationMongoId, range } of primeRanges) {
    const all = byLocation.get(locationMongoId) ?? [];
    const rangeStartMs = new Date(range.startAt).getTime();
    const rangeEndMs = new Date(range.endAt).getTime();
    const filtered =
      rangeStartMs === unionStartD.getTime() &&
      rangeEndMs === unionEndD.getTime()
        ? all.map((i) => i.raw)
        : all
            .filter((i) => i.ts >= rangeStartMs && i.ts <= rangeEndMs)
            .map((i) => i.raw);
    primeTimecardRangeCache(
      locationMongoId,
      { startAt: range.startAt, endAt: range.endAt },
      filtered,
    );
  }
}

export async function getOrderStatsAndSourcesFromCache(
  locationMongoId: string,
  range: TimeRange,
  rollupCtx?: RollupReadContext,
  /** When set, logs rollup vs Mongo orders (e.g. sales-labor KPIs). */
  logContext?: string,
): Promise<{
  actualTotalSales: number;
  transactionCount: number;
  totalDiscounts: number;
  totalRefunds: number;
  totalRefundCount: number;
  sourcesOfSales: ReturnType<typeof getSourcesOfSalesFromOrders>;
} | null> {
  try {
    if (rollupCtx) {
      const split = await tryGetOrderStatsAndSourcesFromDailyRollupsSplit(
        locationMongoId,
        range,
        rollupCtx.timezone,
        rollupCtx.businessStartTime,
      );
      if (split != null) {
        const scanned = await sumOrderStatsAndSourcesAcrossSubRanges(
          split.uncoveredRanges,
          (subRange) => loadSquareOrdersForMongoRange(locationMongoId, subRange),
        );
        logSplitRangeReadOutcome(
          logContext,
          "orderStatsSource",
          "tryGetOrderStatsAndSourcesFromDailyRollupsSplit (net sales, tx count, discounts, refunds, sourcesOfSales merge)",
          "orders",
          {
            presentKeyCount: split.presentKeys.size,
            uncoveredRangeCount: split.uncoveredRanges.length,
          },
        );
        const mergedSourcesById = new Map(split.rollupSourcesOfSalesCentsById);
        mergeCentsByIdInto(mergedSourcesById, scanned.sourcesOfSalesCentsById);
        return {
          actualTotalSales:
            (split.rollupNetSalesCents + scanned.netSalesCents) / 100,
          transactionCount:
            split.rollupTransactionCount + scanned.transactionCount,
          totalDiscounts:
            (split.rollupTotalDiscountCents + scanned.totalDiscountCents) / 100,
          totalRefunds:
            (split.rollupTotalRefundCents + scanned.totalRefundCents) / 100,
          totalRefundCount: split.rollupRefundCount + scanned.refundCount,
          sourcesOfSales: renderSourcesOfSalesSegmentsFromCentsById(
            mergedSourcesById,
          ) as ReturnType<typeof getSourcesOfSalesFromOrders>,
        };
      }
      logSplitRangeMiss(
        logContext,
        "orderStatsSource",
        "mongo_orders",
        "rollup miss, ROLLUP_READ_ENABLED off, or zero matching daily rows — getOrderStatsFromOrders + getSourcesOfSalesFromOrders",
      );
    } else {
      logSplitRangeMiss(
        logContext,
        "orderStatsSource",
        "mongo_orders",
        "no rollup context — orders from Mongo only",
      );
    }
    const orders = await loadSquareOrdersForMongoRange(locationMongoId, range);
    const orderStats = getOrderStatsFromOrders(orders);
    const sourcesOfSales = getSourcesOfSalesFromOrders(orders);
    return {
      actualTotalSales: orderStats.netSalesCents / 100,
      transactionCount: orderStats.orderCount,
      totalDiscounts: orderStats.totalDiscountCents / 100,
      totalRefunds: orderStats.totalRefundCents / 100,
      totalRefundCount: orderStats.refundCount,
      sourcesOfSales,
    };
  } catch {
    return null;
  }
}

export async function searchOrdersInRangeFromCache(
  locationMongoId: string,
  range: TimeRange,
): Promise<OrderInRange[]> {
  const orders = await loadSquareOrdersForMongoRange(locationMongoId, range);
  const out: OrderInRange[] = [];
  for (const o of orders) {
    if (!isOrderCountedForNetSales(o)) continue;
    const raw = o as unknown as Record<string, unknown>;
    const createdMs = getSquareOrderCreatedAtMsFromRaw(raw);
    if (createdMs == null) continue;
    const created_at = new Date(createdMs).toISOString();
    out.push({
      created_at,
      amountCents: orderNetSalesCents(o),
    });
  }
  return out;
}

/**
 * Dashboard reads: Square order metrics from Mongo sync only (no live SearchOrders).
 */
export async function searchOrdersInRangeWithCacheFallback(
  locationMongoId: string | undefined,
  _squareLocationId: string,
  range: TimeRange,
  _options?: SquareServiceOptions,
): Promise<OrderInRange[]> {
  if (!locationMongoId?.trim()) {
    return [];
  }
  return searchOrdersInRangeFromCache(locationMongoId.trim(), range);
}

/** Labor time series from synced Homebase timecards (same bucket logic as live API). */
export async function getLaborAndHoursTimeSeriesInRangeFromCache(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  granularity: SalesTrendGranularity,
  periodType?: string,
  businessStartTime?: string,
): Promise<LaborHoursTimeSeriesResult> {
  const bst = businessStartTime?.trim();
  let bucketOpts: GetOrderedBucketsAndLabelsOptions | undefined;
  if (periodType == null && bst == null) {
    bucketOpts = undefined;
  } else {
    const o: GetOrderedBucketsAndLabelsOptions = {};
    if (periodType != null) {
      o.periodType = periodType;
    }
    if (bst != null && bst !== "") {
      o.businessStartTime = bst;
    }
    bucketOpts = o;
  }
  const { keys, labels } = getOrderedBucketsAndLabels(
    range,
    timezone,
    granularity,
    bucketOpts,
  );
  const laborCostByKey: Record<string, number> = {};
  const hoursByKey: Record<string, number> = {};
  for (const k of keys) {
    laborCostByKey[k] = 0;
    hoursByKey[k] = 0;
  }
  const t0 = performance.now();
  const timecards = await loadHomebaseTimecardsForMongoRange(
    locationMongoId,
    range,
  );
  logger.info("[sales-trend] labor time series: Homebase timecards from Mongo", {
    granularity,
    bucketCount: keys.length,
    timecardCount: timecards.length,
    loadTimecardsMs: Math.round(performance.now() - t0),
    rangeStart: range.startAt,
    rangeEnd: range.endAt,
    locationMongoId,
  });
  aggregateTimecardsIntoBuckets(
    timecards,
    keys,
    timezone,
    granularity,
    laborCostByKey,
    hoursByKey,
    bst,
  );
  return {
    labels,
    laborCost: keys.map((k) => laborCostByKey[k] ?? 0),
    hours: keys.map((k) => hoursByKey[k] ?? 0),
  };
}

export async function fetchHourlyNetSalesCentsBySlotFromCache(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  /** When set, logs rollup vs Mongo order bucketing (e.g. command-center hourly-sales). */
  logContext?: string,
): Promise<number[]> {
  const fromRollup = await tryGetHourlyNetSalesCentsBySlotFromRollups(
    locationMongoId,
    range,
    timezone,
    businessStartTime,
  );
  if (fromRollup) {
    if (logContext) {
      console.log("[api-data-source]", logContext, {
        hourlySalesSource: "rollups",
        detail:
          "SquareOrderHourlyRollup (24 slots; tryGetHourlyNetSalesCentsBySlotFromRollups)",
      });
    }
    return fromRollup;
  }
  if (logContext) {
    console.log("[api-data-source]", logContext, {
      hourlySalesSource: "mongo_orders",
      detail:
        "rollup miss, ROLLUP_READ_ENABLED off, or incomplete hourly rows — getBusinessHourIndex on Mongo orders",
    });
  }

  const netSalesCentsBySlot = new Array<number>(24).fill(0);
  const orders = await searchOrdersInRangeFromCache(locationMongoId, range);
  for (const order of orders) {
    const slot = getBusinessHourIndex(
      order.created_at,
      timezone,
      businessStartTime,
    );
    if (slot >= 0 && slot < 24) {
      netSalesCentsBySlot[slot] =
        (netSalesCentsBySlot[slot] ?? 0) + order.amountCents;
    }
  }
  return netSalesCentsBySlot;
}

export async function searchOrdersWithDiscountsFromCache(
  locationMongoId: string,
  range: TimeRange,
): Promise<ReturnType<typeof squareOrdersToWithDiscounts>> {
  const orders = await loadSquareOrdersForMongoRange(locationMongoId, range);
  return squareOrdersToWithDiscounts(orders);
}

export async function getSquarePaymentDetailsFromCache(
  paymentId: string,
): Promise<{
  id: string;
  employeeId: string | null;
  teamMemberId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  amountMoneyCents?: number;
  tipMoneyCents?: number;
  receiptNumber: string | null;
  receiptUrl: string | null;
  deviceName: string | null;
} | null> {
  const doc = await SquarePaymentModel.findOne({ squareId: paymentId })
    .lean()
    .exec();
  if (!doc?.raw) return null;
  const p = doc.raw;
  const amountMoney = p.amount_money as SquarePaymentMoneyField;
  const tipMoney = p.tip_money as SquarePaymentMoneyField;
  const toCents = (m: SquarePaymentMoneyField): number | undefined => {
    const a = m?.amount;
    if (a == null) return undefined;
    if (typeof a === "bigint") return Number(a);
    if (typeof a === "number") return a;
    const n = Number(a);
    return Number.isFinite(n) ? n : undefined;
  };
  const amountCents = toCents(amountMoney);
  const tipCents = toCents(tipMoney);
  const row: {
    id: string;
    employeeId: string | null;
    teamMemberId: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    amountMoneyCents?: number;
    tipMoneyCents?: number;
    receiptNumber: string | null;
    receiptUrl: string | null;
    deviceName: string | null;
  } = {
    id: squareRawIdAsString(p.id, paymentId),
    employeeId: (p.employee_id as string | null | undefined) ?? null,
    teamMemberId: (p.team_member_id as string | null | undefined) ?? null,
    createdAt: (p.created_at as string | null | undefined) ?? null,
    updatedAt: (p.updated_at as string | null | undefined) ?? null,
    receiptNumber: (p.receipt_number as string | null | undefined) ?? null,
    receiptUrl: (p.receipt_url as string | null | undefined) ?? null,
    deviceName:
      ((p.device_details as { device_name?: string } | undefined)?.device_name as
        | string
        | null
        | undefined) ?? null,
  };
  if (amountCents != null) row.amountMoneyCents = amountCents;
  if (tipCents != null) row.tipMoneyCents = tipCents;
  return row;
}

export async function getSquareTeamMemberRawFromCache(
  teamMemberId: string,
): Promise<{
  id: string;
  givenName: string | null;
  familyName: string | null;
  jobTitle?: string;
} | null> {
  const doc = await SquareTeamMemberModel.findOne({ squareId: teamMemberId })
    .lean()
    .exec();
  if (!doc?.raw) return null;
  const m = doc.raw;
  const wage = m.wage_setting as
    | { job_assignments?: Array<{ job_title?: string }> }
    | undefined;
  const jobTitleRaw = wage?.job_assignments?.[0]?.job_title?.trim();
  const jobTitle =
    jobTitleRaw && jobTitleRaw.length > 0 ? jobTitleRaw : undefined;
  return {
    id: squareRawIdAsString(m.id, teamMemberId),
    givenName: (m.given_name as string | null | undefined) ?? null,
    familyName: (m.family_name as string | null | undefined) ?? null,
    ...(jobTitle === undefined ? {} : { jobTitle }),
  };
}

export async function fetchHourlyLaborCostPerHourFromCache(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
): Promise<number[]> {
  const cards = await loadHomebaseTimecardsForMongoRange(
    locationMongoId,
    range,
  );
  return computeLaborCostPerHourFromTimecards(
    cards,
    range.endAt,
    timezone,
    businessStartTime,
  );
}

export function createMongoCatalogBatchRetrieve(
  locationMongoId: string,
): BatchRetrieveCatalogFn {
  return async (
    objectIds: string[],
    _accessToken: string,
    includeRelated: boolean,
  ) => {
    const oid = new mongoose.Types.ObjectId(locationMongoId);
    const docs = await SquareCatalogObjectModel.find({
      locationId: oid,
      objectId: { $in: objectIds },
    })
      .lean()
      .exec();
    const objects = docs.map((d) => d.raw as CatalogObjectForCategory);

    /**
     * Square BatchRetrieveCatalog with include_related_objects returns parent ITEMs for
     * ITEM_VARIATION ids. We store one doc per catalog object id; line items reference
     * variation ids, so without loading item_id targets category never resolves.
     */
    let related_objects: CatalogObjectForCategory[] = [];
    if (includeRelated) {
      const fetchedIds = new Set(docs.map((d) => d.objectId));
      const itemIds = new Set<string>();
      for (const raw of objects) {
        if (raw.type !== "ITEM_VARIATION") continue;
        const itemId = raw.item_variation_data?.item_id;
        if (itemId == null || itemId === "") continue;
        const id = String(itemId);
        if (!fetchedIds.has(id)) itemIds.add(id);
      }
      if (itemIds.size > 0) {
        const itemDocs = await SquareCatalogObjectModel.find({
          locationId: oid,
          objectId: { $in: [...itemIds] },
        })
          .lean()
          .exec();
        related_objects = itemDocs.map(
          (d) => d.raw as CatalogObjectForCategory,
        );
      }
    }

    return { objects, related_objects };
  };
}

/**
 * Compares stored daily rollups to on-the-fly cache aggregation for one location + business day.
 * Use after running rollup scripts to validate parity.
 *
 * Local: npm run verify-daily-rollup-parity -- --locationId <mongoId> --businessDateKey 2026-03-15
 * Optional: `--buyerGuid` for MarketMan (defaults to location.marketManBuyerGuid or first cache buyer).
 *
 * Backfill `categoriesBreakdown`: re-run `rollup-square-orders-daily` for affected business days, then
 * period rebuild (`rebuildSquareOrderDerivedRollupsForBusinessDay` / same pipeline as the daily script)
 * so week/month/year rollups merge daily category rows.
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { HomebaseTimecardDailyRollupModel } from "../models/homebaseTimecardDailyRollup.model.js";
import { MarketManOrderDailyRollupModel } from "../models/marketmanOrderDailyRollup.model.js";
import { SquareOrderDailyRollupModel } from "../models/squareOrderDailyRollup.model.js";
import { SquarePaymentDailyRollupModel } from "../models/squarePaymentDailyRollup.model.js";
import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import {
  computeSquarePaymentMetricsForRange,
  countMarketManOrdersForBusinessDay,
  timeRangeForBusinessDateKey,
} from "../services/dailyRollupBuilder.service.js";
import {
  createMongoCatalogBatchRetrieve,
  getLaborCostInRangeFromCache,
  getOrderStatsAndSourcesFromCache,
  getTotalHoursInRangeFromCache,
  loadSquareOrdersForMongoRange,
} from "../services/integrationCacheRead.service.js";
import {
  isOrderCountedForNetSales,
  getSourcesOfSalesFromOrders,
  orderNetSalesCents,
} from "../services/square.service.js";
import { lineItemTotalMoneyToCents } from "../utils/squareNetSalesByCategoryHelpers.js";
import {
  computeCategoryBreakdownFromOrdersForRollup,
  type CategoryRollupBreakdownRow,
} from "../utils/squareCategoryRollupBreakdown.util.js";
import { sumSourcesOfSalesSegmentsToCentsById } from "../utils/squareSourcesOfSalesMerge.util.js";
import {
  distinctBuyerGuidsForMarketManRollup,
  loadLocationsForRollupScript,
} from "../utils/rollupLocations.util.js";
import { logger } from "../utils/logger.util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

function parseVerifyArgs(argv: string[]): {
  locationId: string;
  businessDateKey: string;
  buyerGuid?: string;
} {
  let locationId: string | undefined;
  let businessDateKey: string | undefined;
  let buyerGuid: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--locationId") locationId = argv[++i]?.trim();
    else if (a === "--businessDateKey") businessDateKey = argv[++i]?.trim();
    else if (a === "--buyerGuid") buyerGuid = argv[++i]?.trim();
  }
  if (!locationId || !businessDateKey) {
    throw new Error(
      "Required: --locationId <id> --businessDateKey yyyy-MM-dd",
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDateKey)) {
    throw new Error(`Invalid --businessDateKey: ${businessDateKey}`);
  }
  const bg = buyerGuid?.trim();
  if (bg) return { locationId, businessDateKey, buyerGuid: bg };
  return { locationId, businessDateKey };
}

const API_KINDS: MarketManOrderApiKind[] = ["sent", "delivery"];

function categoryBreakdownParity(
  stored: CategoryRollupBreakdownRow[] | undefined,
  expected: CategoryRollupBreakdownRow[],
): boolean {
  const norm = (rows: CategoryRollupBreakdownRow[]) =>
    [...rows].sort((a, b) => a.categoryId.localeCompare(b.categoryId));
  const a = norm(stored ?? []);
  const b = norm(expected);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.categoryId !== y.categoryId ||
      x.netSalesCents !== y.netSalesCents ||
      x.transactionCount !== y.transactionCount
    ) {
      return false;
    }
  }
  return true;
}

async function main(): Promise<void> {
  try {
    const { locationId, businessDateKey, buyerGuid: buyerArg } =
      parseVerifyArgs(process.argv.slice(2));
    await connectDatabase();
    const locations = await loadLocationsForRollupScript(locationId);
    const loc = locations[0];
    if (!loc) {
      console.error("Location not found:", locationId);
      process.exit(1);
      return;
    }
    const range = timeRangeForBusinessDateKey(
      loc.timezone,
      loc.businessStartTime,
      businessDateKey,
    );
    const locIdStr = String(loc._id);

    const cacheOrders = await getOrderStatsAndSourcesFromCache(locIdStr, range);
    const rollupOrder = await SquareOrderDailyRollupModel.findOne({
      locationId: loc._id,
      businessDateKey,
    })
      .lean()
      .exec();

    const orderOk =
      cacheOrders != null &&
      rollupOrder != null &&
      Math.abs(cacheOrders.actualTotalSales - rollupOrder.netSalesCents / 100) <
        0.02 &&
      cacheOrders.transactionCount === rollupOrder.transactionCount &&
      Math.abs(cacheOrders.totalDiscounts - rollupOrder.totalDiscountCents / 100) <
        0.02 &&
      Math.abs(cacheOrders.totalRefunds - rollupOrder.totalRefundCents / 100) <
        0.02 &&
      cacheOrders.totalRefundCount === rollupOrder.refundCount;

    const ordersForCategory = await loadSquareOrdersForMongoRange(
      locIdStr,
      range,
    );
    const expectedCategoryBreakdown =
      await computeCategoryBreakdownFromOrdersForRollup(
        ordersForCategory,
        createMongoCatalogBatchRetrieve(locIdStr),
        "",
        {
          isCounted: isOrderCountedForNetSales as (o: unknown) => boolean,
          getOrderCents: orderNetSalesCents as (o: unknown) => number,
          getLineCents: lineItemTotalMoneyToCents,
        },
      );
    const categoryOk =
      rollupOrder != null &&
      categoryBreakdownParity(
        rollupOrder.categoriesBreakdown as CategoryRollupBreakdownRow[] | undefined,
        expectedCategoryBreakdown,
      );

    const expectedSourcesMap = sumSourcesOfSalesSegmentsToCentsById(
      getSourcesOfSalesFromOrders(ordersForCategory) as unknown as unknown[],
    );
    const rolledSourcesMap = sumSourcesOfSalesSegmentsToCentsById(
      (rollupOrder?.sourcesOfSales as unknown[] | undefined) ?? [],
    );
    const sourcesOk =
      rollupOrder != null &&
      expectedSourcesMap.size === rolledSourcesMap.size &&
      [...expectedSourcesMap.entries()].every(
        ([k, v]) => rolledSourcesMap.get(k) === v,
      );

    const laborCache = await getLaborCostInRangeFromCache(locIdStr, range);
    const hoursCache = await getTotalHoursInRangeFromCache(locIdStr, range);
    const rollupHb = await HomebaseTimecardDailyRollupModel.findOne({
      locationId: loc._id,
      businessDateKey,
    })
      .lean()
      .exec();
    const hbOk =
      rollupHb &&
      Math.abs(laborCache - rollupHb.totalLaborCost) < 0.02 &&
      Math.abs(hoursCache - rollupHb.totalPaidHours) < 0.0001;

    const payExpected = await computeSquarePaymentMetricsForRange(
      locIdStr,
      range,
    );
    const rollupPay = await SquarePaymentDailyRollupModel.findOne({
      locationId: loc._id,
      businessDateKey,
    })
      .lean()
      .exec();
    const payOk =
      rollupPay &&
      payExpected.paymentCount === rollupPay.paymentCount &&
      payExpected.totalAmountCents === rollupPay.totalAmountCents;

    const buyerGuids = buyerArg?.trim()
      ? [buyerArg.trim()]
      : await distinctBuyerGuidsForMarketManRollup(locIdStr, loc.marketManBuyerGuid);
    const mmResults: Array<{
      buyerGuid: string;
      apiKind: MarketManOrderApiKind;
      expected: number;
      stored: number | undefined;
      ok: boolean;
    }> = [];
    for (const bg of buyerGuids) {
      for (const apiKind of API_KINDS) {
        const expected = await countMarketManOrdersForBusinessDay(
          locIdStr,
          bg,
          apiKind,
          businessDateKey,
          loc.timezone,
          loc.businessStartTime,
        );
        const rollupMm = await MarketManOrderDailyRollupModel.findOne({
          locationId: loc._id,
          buyerGuid: bg,
          apiKind,
          businessDateKey,
        })
          .lean()
          .exec();
        const stored = rollupMm?.orderCount;
        mmResults.push({
          buyerGuid: bg,
          apiKind,
          expected,
          stored,
          ok: stored === expected,
        });
      }
    }

    const report = {
      locationId: locIdStr,
      businessDateKey,
      timezone: loc.timezone,
      squareOrders: {
        cache: cacheOrders,
        rollup: rollupOrder
          ? {
              netSalesCents: rollupOrder.netSalesCents,
              transactionCount: rollupOrder.transactionCount,
              totalDiscountCents: rollupOrder.totalDiscountCents,
              totalRefundCents: rollupOrder.totalRefundCents,
              refundCount: rollupOrder.refundCount,
              sourcesOfSales: rollupOrder.sourcesOfSales,
              categoriesBreakdown: rollupOrder.categoriesBreakdown,
            }
          : null,
        expectedCategoryBreakdown,
        match: orderOk === true,
        categoryBreakdownMatch: categoryOk === true,
        sourcesOfSalesMatch: sourcesOk === true,
      },
      homebase: {
        cache: { laborCost: laborCache, hours: hoursCache },
        rollup: rollupHb
          ? {
              totalLaborCost: rollupHb.totalLaborCost,
              totalPaidHours: rollupHb.totalPaidHours,
            }
          : null,
        match: hbOk === true,
      },
      squarePayments: {
        expected: payExpected,
        rollup: rollupPay
          ? {
              paymentCount: rollupPay.paymentCount,
              totalAmountCents: rollupPay.totalAmountCents,
            }
          : null,
        match: payOk === true,
      },
      marketMan: mmResults,
    };

    console.log(JSON.stringify(report, null, 2));
    const mmAllOk = mmResults.length === 0 || mmResults.every((r) => r.ok);
    const allOk =
      orderOk === true &&
      categoryOk === true &&
      hbOk === true &&
      payOk === true &&
      mmAllOk;
    if (!allOk) {
      logger.warn("verify-daily-rollup-parity: mismatch", { report });
      console.error("\n❌ Parity check reported mismatches or missing rollups.\n");
      await mongoose.disconnect();
      process.exit(1);
      return;
    }
    console.log("\n✅ Parity OK for compared fields.\n");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error("verify-daily-rollup-parity failed", error);
    console.error("\n❌ Failed:", error);
    try {
      await mongoose.disconnect();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}

void main();

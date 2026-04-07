/**
 * One-shot (local): populate denormalized index fields on SquareOrder, SquarePayment,
 * HomebaseTimecard, and MarketManOrderCache so range queries use compound indexes.
 * Idempotent — safe to re-run.
 *
 * SquarePayment: `paymentCreatedAt` / `paymentStatus` are required for fast payment rollups
 * (`npm run rollup-square-payments-daily`).
 *
 * Run: npm run backfill-integration-cache-index-fields
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { SquareOrderModel } from "../models/squareOrder.model.js";
import { SquarePaymentModel } from "../models/squarePayment.model.js";
import { HomebaseTimecardModel } from "../models/homebaseTimecard.model.js";
import { MarketManOrderCacheModel } from "../models/marketmanOrderCache.model.js";
import { getSquareOrderMongoIndexFields } from "../utils/squareOrderMongoIndexFields.util.js";
import { getSquarePaymentMongoIndexFields } from "../utils/squarePaymentMongoIndexFields.util.js";
import { getHomebaseTimecardClockInAt } from "../utils/homebaseTimecardIndexFields.util.js";
import { getMarketManOrderBusinessDateAt } from "../utils/marketmanOrderIndexFields.util.js";
import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import { logger } from "../utils/logger.util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const BATCH = 500;

async function backfillSquareOrders(): Promise<number> {
  let updated = 0;
  const cursor = SquareOrderModel.find({}).select({ raw: 1 }).cursor();
  let batch: unknown[] = [];
  for await (const doc of cursor) {
    const raw = doc.raw as Record<string, unknown>;
    const idx = getSquareOrderMongoIndexFields(raw);
    batch.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            squareCreatedAt: idx.squareCreatedAt,
            excludedFromDashboard: idx.excludedFromDashboard,
          },
        },
      },
    });
    if (batch.length >= BATCH) {
      await SquareOrderModel.bulkWrite(batch as never, { ordered: false });
      updated += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await SquareOrderModel.bulkWrite(batch as never, { ordered: false });
    updated += batch.length;
  }
  return updated;
}

async function backfillSquarePayments(): Promise<number> {
  let updated = 0;
  const cursor = SquarePaymentModel.find({}).select({ raw: 1 }).cursor();
  let batch: unknown[] = [];
  for await (const doc of cursor) {
    const raw = doc.raw as Record<string, unknown>;
    const idx = getSquarePaymentMongoIndexFields(raw);
    batch.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            paymentCreatedAt: idx.paymentCreatedAt,
            paymentStatus: idx.paymentStatus,
          },
        },
      },
    });
    if (batch.length >= BATCH) {
      await SquarePaymentModel.bulkWrite(batch as never, { ordered: false });
      updated += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await SquarePaymentModel.bulkWrite(batch as never, { ordered: false });
    updated += batch.length;
  }
  return updated;
}

async function backfillHomebaseTimecards(): Promise<number> {
  let updated = 0;
  const cursor = HomebaseTimecardModel.find({}).select({ raw: 1 }).cursor();
  let batch: unknown[] = [];
  for await (const doc of cursor) {
    const raw = doc.raw as Record<string, unknown>;
    batch.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: { clockInAt: getHomebaseTimecardClockInAt(raw) },
        },
      },
    });
    if (batch.length >= BATCH) {
      await HomebaseTimecardModel.bulkWrite(batch as never, { ordered: false });
      updated += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await HomebaseTimecardModel.bulkWrite(batch as never, { ordered: false });
    updated += batch.length;
  }
  return updated;
}

async function backfillMarketManOrders(): Promise<number> {
  let updated = 0;
  const cursor = MarketManOrderCacheModel.find({})
    .select({ raw: 1, apiKind: 1 })
    .cursor();
  let batch: unknown[] = [];
  for await (const doc of cursor) {
    const raw = doc.raw as Record<string, unknown>;
    const apiKind = doc.apiKind as MarketManOrderApiKind;
    batch.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            businessDateAt: getMarketManOrderBusinessDateAt(raw, apiKind),
          },
        },
      },
    });
    if (batch.length >= BATCH) {
      await MarketManOrderCacheModel.bulkWrite(batch as never, { ordered: false });
      updated += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await MarketManOrderCacheModel.bulkWrite(batch as never, { ordered: false });
    updated += batch.length;
  }
  return updated;
}

async function main(): Promise<void> {
  try {
    await connectDatabase();
    logger.info("Backfill: SquareOrder index fields…");
    const nSq = await backfillSquareOrders();
    logger.info("Backfill: SquareOrder done", { documents: nSq });
    logger.info("Backfill: SquarePayment index fields…");
    const nPay = await backfillSquarePayments();
    logger.info("Backfill: SquarePayment done", { documents: nPay });
    logger.info("Backfill: HomebaseTimecard index fields…");
    const nHb = await backfillHomebaseTimecards();
    logger.info("Backfill: HomebaseTimecard done", { documents: nHb });
    logger.info("Backfill: MarketManOrderCache index fields…");
    const nMm = await backfillMarketManOrders();
    logger.info("Backfill: MarketManOrderCache done", { documents: nMm });
    console.log("\n✅ Backfill complete.", {
      squareOrders: nSq,
      squarePayments: nPay,
      homebaseTimecards: nHb,
      marketManOrders: nMm,
    }, "\n");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error("Backfill integration cache index fields failed", error);
    console.error("\n❌ Backfill failed:", error);
    try {
      await mongoose.disconnect();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}

void main();

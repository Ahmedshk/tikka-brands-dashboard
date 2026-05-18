/**
 * One-off diagnostic for the slow rollup probes seen on the all-locations
 * dashboard fan-out.
 *
 * Reports, for both SquareOrderHourlyRollup and SquareOrder:
 *  - The actual indexes Mongo has built (vs. what the schema declares).
 *  - Document count and storage size, to gauge how big the collection is.
 *  - Latency of the exact `exists` query the rollup probe issues, against
 *    every location for today + yesterday, run sequentially and concurrently
 *    so we can see queue effects.
 *  - The query plan (.explain) for one of those probes, so we know which
 *    index the planner picked and whether it's a real index scan vs collscan.
 *
 * Usage: npm run diagnose-rollup-probe-perf
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { performance } from "node:perf_hooks";
import { connectDatabase } from "../config/database.js";
import { SquareOrderHourlyRollupModel } from "../models/squareOrderHourlyRollup.model.js";
import { SquareOrderModel } from "../models/squareOrder.model.js";
import { LocationModel } from "../models/location.model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

function todayUtcDateString(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yesterdayUtcDateString(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function showIndexes(label: string, model: mongoose.Model<unknown>): Promise<void> {
  const indexes = await model.collection.indexes();
  console.log(`\n=== ${label} indexes (${indexes.length}) ===`);
  for (const ix of indexes) {
    console.log(`  name=${ix.name} key=${JSON.stringify(ix.key)} unique=${ix.unique ?? false} partial=${JSON.stringify(ix.partialFilterExpression ?? null)}`);
  }
  const stats = (await model.collection.estimatedDocumentCount()) ?? 0;
  console.log(`  estimated document count: ${stats}`);
}

async function timeExists(label: string, fn: () => Promise<unknown>): Promise<number> {
  const t0 = performance.now();
  await fn();
  const ms = Math.round(performance.now() - t0);
  console.log(`  ${label}: ${ms} ms`);
  return ms;
}

async function main(): Promise<void> {
  await connectDatabase();
  try {
    await showIndexes("SquareOrderHourlyRollup", SquareOrderHourlyRollupModel as never);
    await showIndexes("SquareOrder", SquareOrderModel as never);

    const locations = await LocationModel.find({}, { _id: 1 }).lean().exec();
    console.log(`\n=== Locations found: ${locations.length} ===`);
    if (locations.length === 0) {
      console.log("No locations to probe. Done.");
      return;
    }

    const today = todayUtcDateString();
    const yesterday = yesterdayUtcDateString();
    const businessDateKeys = [yesterday, today];
    console.log(`\nProbing business dates: ${JSON.stringify(businessDateKeys)}`);

    console.log("\n=== Hourly rollup `exists` — SEQUENTIAL (one at a time) ===");
    const seqTimes: number[] = [];
    for (const loc of locations) {
      const ms = await timeExists(`loc=${loc._id}`, () =>
        SquareOrderHourlyRollupModel.exists({
          locationId: loc._id as mongoose.Types.ObjectId,
          businessDateKey: { $in: businessDateKeys },
        }),
      );
      seqTimes.push(ms);
    }
    const seqSum = seqTimes.reduce((a, b) => a + b, 0);
    console.log(`  sequential total: ${seqSum} ms; mean: ${Math.round(seqSum / seqTimes.length)} ms`);

    console.log("\n=== Hourly rollup `exists` — CONCURRENT (Promise.all, matches real fan-out) ===");
    const tConcStart = performance.now();
    const conc = await Promise.all(
      locations.map((loc) =>
        SquareOrderHourlyRollupModel.exists({
          locationId: loc._id as mongoose.Types.ObjectId,
          businessDateKey: { $in: businessDateKeys },
        }).then(() => Math.round(performance.now() - tConcStart)),
      ),
    );
    const concTotal = Math.round(performance.now() - tConcStart);
    console.log(`  concurrent total wall-time: ${concTotal} ms`);
    console.log(`  individual completion times (ms from start): ${JSON.stringify(conc.sort((a, b) => a - b))}`);

    console.log("\n=== Plan for one rollup exists() (.explain('executionStats')) ===");
    const firstLoc = locations[0];
    if (firstLoc) {
      const plan = await SquareOrderHourlyRollupModel.collection
        .find({
          locationId: firstLoc._id as mongoose.Types.ObjectId,
          businessDateKey: { $in: businessDateKeys },
        })
        .limit(1)
        .explain("executionStats");
      const exec = (plan as { executionStats?: { executionTimeMillis?: number; totalKeysExamined?: number; totalDocsExamined?: number; executionStages?: unknown } })
        .executionStats ?? {};
      const winningPlan = (plan as { queryPlanner?: { winningPlan?: unknown } }).queryPlanner?.winningPlan;
      console.log(`  executionTimeMillis: ${exec.executionTimeMillis}`);
      console.log(`  totalKeysExamined:   ${exec.totalKeysExamined}`);
      console.log(`  totalDocsExamined:   ${exec.totalDocsExamined}`);
      console.log(`  winningPlan:         ${JSON.stringify(winningPlan, null, 2)}`);
    }

    const todayStart = new Date(`${today}T00:00:00.000Z`);
    const todayEnd = new Date(`${today}T23:59:59.999Z`);
    console.log("\n=== SquareOrder exists (dashboard query) — CONCURRENT for today ===");
    const tOrdStart = performance.now();
    await Promise.all(
      locations.map((loc) =>
        SquareOrderModel.exists({
          locationId: loc._id as mongoose.Types.ObjectId,
          excludedFromDashboard: false,
          squareCreatedAt: { $gte: todayStart, $lte: todayEnd },
        }),
      ),
    );
    console.log(`  total wall-time: ${Math.round(performance.now() - tOrdStart)} ms`);

    console.log("\n=== Plan for SquareOrder dashboard query (.explain) ===");
    if (firstLoc) {
      const plan = await SquareOrderModel.collection
        .find({
          locationId: firstLoc._id as mongoose.Types.ObjectId,
          excludedFromDashboard: false,
          squareCreatedAt: { $gte: todayStart, $lte: todayEnd },
        })
        .explain("executionStats");
      const exec = (plan as { executionStats?: { executionTimeMillis?: number; totalKeysExamined?: number; totalDocsExamined?: number; executionStages?: unknown } })
        .executionStats ?? {};
      const winningPlan = (plan as { queryPlanner?: { winningPlan?: unknown } }).queryPlanner?.winningPlan;
      console.log(`  executionTimeMillis: ${exec.executionTimeMillis}`);
      console.log(`  totalKeysExamined:   ${exec.totalKeysExamined}`);
      console.log(`  totalDocsExamined:   ${exec.totalDocsExamined}`);
      console.log(`  winningPlan:         ${JSON.stringify(winningPlan, null, 2)}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

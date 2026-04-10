/**
 * Rebuilds only `SquareOrderHourlyRollup` (24 slots) per business day from cached orders.
 * Requires orders in Mongo for that day; run `rollup-square-orders-daily` first if dailies are missing.
 *
 * After changing wall-clock / DST slot logic, re-run for affected `businessDateKey` ranges so stored
 * hourly rows match the new civil-hour buckets.
 *
 * Local: npm run rollup-square-orders-hourly -- --from 2026-03-01 --to 2026-03-07
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { buildSquareOrderHourlyRollupsForDay } from "../services/squareOrderMultiGranularityRollup.service.js";
import {
  iterBusinessDateKeysInclusive,
  parseRollupCliArgs,
  resolveRollupDateRangeForLocation,
} from "../utils/rollupScriptArgs.util.js";
import { loadLocationsForRollupScript } from "../utils/rollupLocations.util.js";
import { logger } from "../utils/logger.util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

async function main(): Promise<void> {
  const args = parseRollupCliArgs(process.argv.slice(2));
  try {
    await connectDatabase();
    const locations = await loadLocationsForRollupScript(args.locationId);
    if (locations.length === 0) {
      console.log("No locations matched; exiting.");
      await mongoose.disconnect();
      process.exit(0);
      return;
    }
    for (const loc of locations) {
      const { fromKey, toKey } = resolveRollupDateRangeForLocation(
        args,
        loc.timezone,
      );
      const days = iterBusinessDateKeysInclusive(fromKey, toKey);
      for (const businessDateKey of days) {
        await buildSquareOrderHourlyRollupsForDay(
          String(loc._id),
          businessDateKey,
          loc.timezone,
          loc.businessStartTime,
        );
        logger.info("Square order hourly rollup", {
          locationId: String(loc._id),
          businessDateKey,
        });
      }
    }
    console.log("\n✅ Square order hourly rollups complete.\n");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error("rollup-square-orders-hourly failed", error);
    console.error("\n❌ Rollup failed:", error);
    try {
      await mongoose.disconnect();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}

void main();

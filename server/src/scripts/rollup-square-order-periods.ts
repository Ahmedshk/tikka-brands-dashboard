/**
 * Rebuilds Square order **week / month / year** period rollups by summing daily docs,
 * for each business day in `--from`..`--to`. Idempotent (`replaceOne` per period).
 *
 * Run **after** `SquareOrderDailyRollup` exists for those days (`rollup-square-orders-daily` or `rollup-all`).
 * Use after deploy if week `periodKey` semantics change (weeks are **Sunday-start** in location TZ).
 *
 * Local: npm run rollup-square-order-periods -- --from 2026-04-01 --to 2026-04-30
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { rebuildSquareOrderPeriodRollupsForBusinessDateKey } from "../services/squareOrderMultiGranularityRollup.service.js";
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
        await rebuildSquareOrderPeriodRollupsForBusinessDateKey(
          String(loc._id),
          businessDateKey,
          loc.timezone,
        );
        logger.info("Square order period rollups", {
          locationId: String(loc._id),
          businessDateKey,
        });
      }
    }
    console.log("\n✅ Square order period rollups complete.\n");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error("rollup-square-order-periods failed", error);
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

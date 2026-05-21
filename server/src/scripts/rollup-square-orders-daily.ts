/**
 * Idempotent: upserts `SquareOrderDailyRollup` per location and business day.
 * Business-day window per location (`businessDateKey` = opening date in TZ). After each daily doc,
 * rebuilds Square hourly + week/month/year period rollups for that day.
 *
 * Local: npm run rollup-square-orders-daily -- --from 2026-03-01 --to 2026-03-07
 * Optional: `--locationId` (Mongo _id). Omit `--from`/`--to` to use yesterday per location TZ.
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import {
  buildSquareOrderRollupForDay,
} from "../services/dailyRollupBuilder.service.js";
import { rebuildSquareOrderDerivedRollupsForBusinessDay } from "../services/squareOrderMultiGranularityRollup.service.js";
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
    const locations = await loadLocationsForRollupScript(args.locationIds ?? args.locationId);
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
        await buildSquareOrderRollupForDay(
          String(loc._id),
          businessDateKey,
          loc.timezone,
          loc.businessStartTime,
        );
        await rebuildSquareOrderDerivedRollupsForBusinessDay(
          String(loc._id),
          businessDateKey,
          loc.timezone,
          loc.businessStartTime,
        );
        logger.info("Square order rollup", {
          locationId: String(loc._id),
          businessDateKey,
        });
      }
    }
    console.log("\n✅ Square order daily rollups complete.\n");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error("rollup-square-orders-daily failed", error);
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

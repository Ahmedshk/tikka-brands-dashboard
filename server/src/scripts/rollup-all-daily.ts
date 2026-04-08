/**
 * Runs Square orders (+ hourly & coarse period rollups), Square payments, Homebase, and MarketMan dailies.
 * Order: Square order daily → derived Square rollups → payments → Homebase → MarketMan.
 * Same CLI: `--from`, `--to`, `--locationId`. Use `npm run rollup-all` for the same pipeline.
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import {
  buildHomebaseRollupForDay,
  buildMarketManRollupForDay,
  buildSquareOrderRollupForDay,
  buildSquarePaymentRollupForDay,
} from "../services/dailyRollupBuilder.service.js";
import { rebuildSquareOrderDerivedRollupsForBusinessDay } from "../services/squareOrderMultiGranularityRollup.service.js";
import {
  distinctBuyerGuidsForMarketManRollup,
  loadLocationsForRollupScript,
} from "../utils/rollupLocations.util.js";
import {
  iterBusinessDateKeysInclusive,
  parseRollupCliArgs,
  resolveRollupDateRangeForLocation,
} from "../utils/rollupScriptArgs.util.js";
import { logger } from "../utils/logger.util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const API_KINDS: MarketManOrderApiKind[] = ["sent", "delivery"];

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
        await buildSquarePaymentRollupForDay(
          String(loc._id),
          businessDateKey,
          loc.timezone,
          loc.businessStartTime,
        );
        await buildHomebaseRollupForDay(
          String(loc._id),
          businessDateKey,
          loc.timezone,
          loc.businessStartTime,
        );
        const buyerGuids = await distinctBuyerGuidsForMarketManRollup(
          String(loc._id),
          loc.marketManBuyerGuid,
        );
        for (const buyerGuid of buyerGuids) {
          for (const apiKind of API_KINDS) {
            await buildMarketManRollupForDay(
              String(loc._id),
              buyerGuid,
              apiKind,
              businessDateKey,
              loc.timezone,
              loc.businessStartTime,
            );
          }
        }
        logger.info("rollup-all-daily day complete", {
          locationId: String(loc._id),
          businessDateKey,
          marketManBuyers: buyerGuids.length,
        });
      }
    }
    console.log("\n✅ All daily rollups complete.\n");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error("rollup-all-daily failed", error);
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

/**
 * Builder for `HomebaseTimecardHourlyRollup` (labor cost per business-hour
 * slot).
 *
 * Pre-aggregates so the dashboard's hourly-breakdown card doesn't have to
 * prorate raw timecards across 24 slots on the read path. The matching reader
 * lives in `homebaseTimecardHourlyRollupRead.service.ts` — kept in a separate
 * file because the reader needs no Mongo orders cache imports, avoiding a
 * cycle with `integrationCacheRead.service.ts` (which is where the reader is
 * consumed from).
 *
 * Mirrors {@link buildSquareOrderHourlyRollupsForDay} on the Square side.
 */
import mongoose from "mongoose";
import { HomebaseTimecardHourlyRollupModel } from "../models/homebaseTimecardHourlyRollup.model.js";
import { loadHomebaseTimecardsForMongoRange } from "./integrationCacheRead.service.js";
import { computeLaborCostPerHourFromTimecards } from "../utils/homebaseLaborHelpers.js";
import { timeRangeForBusinessDateKey } from "./dailyRollupBuilder.service.js";

/**
 * Rebuild all 24 hourly labor rollup rows for one business day.
 *
 * Uses `replaceOne(..., upsert: true)` so a re-run idempotently overwrites the
 * existing slot rows — important when webhooks for late-arriving timecards
 * trigger a rebuild for an older day.
 */
export async function buildHomebaseTimecardHourlyRollupsForDay(
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
  const timecards = await loadHomebaseTimecardsForMongoRange(
    locationMongoId,
    range,
  );
  const perSlot = computeLaborCostPerHourFromTimecards(
    timecards,
    range.endAt,
    timezone,
    businessStartTime,
  );
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const computedAt = new Date();
  for (let slotIndex = 0; slotIndex < 24; slotIndex++) {
    const cost = perSlot[slotIndex] ?? 0;
    await HomebaseTimecardHourlyRollupModel.replaceOne(
      { locationId: oid, businessDateKey, slotIndex },
      {
        locationId: oid,
        businessDateKey,
        slotIndex,
        computedAt,
        laborCost: cost,
      },
      { upsert: true },
    ).exec();
  }
}


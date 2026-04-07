import type { Agenda } from "agenda";
import { formatInTimeZone } from "date-fns-tz";
import { runSyncForAllLocations } from "../services/integrationSyncRunner.service.js";
import {
  refreshHomebaseRollupsAfterPoll,
  refreshMarketManRollupsAfterPoll,
} from "../services/integrationPollRollupRefresh.service.js";
import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import { logger } from "../utils/logger.util.js";

function denverDateKey(d = new Date()): string {
  return formatInTimeZone(d, "America/Denver", "yyyy-MM-dd");
}

/** First 30 minutes of 08:00 in America/Denver (handles DST). */
function isDenverEightAmWindow(d = new Date()): boolean {
  const hour = Number(formatInTimeZone(d, "America/Denver", "H"));
  const minute = Number(formatInTimeZone(d, "America/Denver", "m"));
  return hour === 8 && minute < 30;
}

/**
 * If no successful `marketman_valid_count_dates` run is logged for the current Denver calendar day,
 * fetch and upsert valid count dates for all locations (same as the scheduled job).
 */
async function syncMarketManValidCountDatesForTodayDenverIfMissing(
  context: "scheduled_eight_am" | "catch_up_startup",
): Promise<void> {
  const key = denverDateKey();
  const existing = await IntegrationSyncLogModel.findOne({
    resource: "marketman_valid_count_dates",
    status: "success",
    message: `denverDateKey:${key}`,
  }).exec();
  if (existing) return;

  logger.info("marketman_valid_count_dates: syncing", {
    context,
    denverDateKey: key,
  });
  const result = await runSyncForAllLocations("marketman_valid_count_dates");
  await IntegrationSyncLogModel.create({
    resource: "marketman_valid_count_dates",
    locationIds: [],
    status: "success",
    message: `denverDateKey:${key}`,
    counts: { totalUpserted: result.totalUpserted },
  });
}

/**
 * Run after Agenda starts so a same-day sync missed while the server was down (e.g. during the 8am MT window)
 * still runs once the process is back up. No-op if today already logged success.
 */
export async function runCatchUpMarketManValidCountDatesIfMissedToday(): Promise<void> {
  try {
    await syncMarketManValidCountDatesForTodayDenverIfMissing(
      "catch_up_startup",
    );
  } catch (err) {
    logger.error("runCatchUpMarketManValidCountDatesIfMissedToday failed", {
      err,
    });
  }
}

export function registerIntegrationJobs(agenda: Agenda): void {
  agenda.define("integration:catalog-daily", async () => {
    try {
      const key = denverDateKey();
      const existing = await IntegrationSyncLogModel.findOne({
        resource: "square_catalog",
        status: "success",
        message: `denverDateKey:${key}`,
      }).exec();
      if (existing) return;
      const result = await runSyncForAllLocations("square_catalog");
      await IntegrationSyncLogModel.create({
        resource: "square_catalog",
        locationIds: [],
        status: "success",
        message: `denverDateKey:${key}`,
        counts: { totalUpserted: result.totalUpserted },
      });
    } catch (err) {
      logger.error("integration:catalog-daily failed", { err });
    }
  });

  agenda.define("integration:poll-15m", async () => {
    try {
      const hb = await runSyncForAllLocations("homebase_timecards");
      logger.info("integration:poll-15m homebase_timecards done", {
        totalUpserted: hb.totalUpserted,
      });
      try {
        await refreshHomebaseRollupsAfterPoll();
      } catch (rollErr) {
        logger.error("integration:poll-15m homebase rollups failed", {
          err: rollErr,
        });
      }
    } catch (err) {
      logger.error("integration:poll-15m homebase_timecards failed", { err });
    }

    try {
      if (isDenverEightAmWindow()) {
        await syncMarketManValidCountDatesForTodayDenverIfMissing(
          "scheduled_eight_am",
        );
      }

      /** Actual/theo (+ waste cost fields from same API) populate on inventory KPI requests; orders stay on schedule. */
      const mm = await runSyncForAllLocations("marketman_orders_both");
      logger.info("integration:poll-15m marketman_orders_both done", {
        totalUpserted: mm.totalUpserted,
      });
      try {
        await refreshMarketManRollupsAfterPoll();
      } catch (rollErr) {
        logger.error("integration:poll-15m marketman rollups failed", {
          err: rollErr,
        });
      }
    } catch (err) {
      logger.error("integration:poll-15m marketman segment failed", { err });
    }
  });
}

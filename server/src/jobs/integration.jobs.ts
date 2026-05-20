import type { Agenda } from "agenda";
import { formatInTimeZone } from "date-fns-tz";
import { runSyncForAllLocations } from "../services/integrationSyncRunner.service.js";
import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import { spawnPoll15mWorker } from "../workers/spawnIntegrationSyncWorker.util.js";
import { logger } from "../utils/logger.util.js";

function denverDateKey(d = new Date()): string {
  return formatInTimeZone(d, "America/Denver", "yyyy-MM-dd");
}

/** First 30 minutes of 08:00 in America/Denver (handles DST). */
export function isDenverEightAmWindow(d = new Date()): boolean {
  const hour = Number(formatInTimeZone(d, "America/Denver", "H"));
  const minute = Number(formatInTimeZone(d, "America/Denver", "m"));
  return hour === 8 && minute < 30;
}

/**
 * If no successful `marketman_valid_count_dates` run is logged for the current Denver calendar day,
 * fetch and upsert valid count dates for all locations (same as the scheduled job).
 */
export async function syncMarketManValidCountDatesForTodayDenverIfMissing(
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

  agenda.define("integration:poll-15m", () => {
    // The actual sync + rollup work runs in a dedicated worker_threads worker
    // (see integrationPoll15mBackground.ts) so it never hitches the HTTP
    // event loop on the main thread. The Agenda handler just spawns and
    // returns immediately.
    const result = spawnPoll15mWorker();
    if (!result.spawned) {
      logger.info(
        "integration:poll-15m skipped (previous run still in progress)",
        { reason: result.reason },
      );
    }
  });
}

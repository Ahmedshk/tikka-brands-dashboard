import type { Agenda } from "agenda";
import { formatInTimeZone } from "date-fns-tz";
import { runSyncForAllLocations } from "../services/integrationSyncRunner.service.js";
import {
  refreshHomebaseRollupsAfterPoll,
  refreshMarketManRollupsAfterPoll,
  refreshSquareOrderRollupsAfterPoll,
} from "../services/integrationPollRollupRefresh.service.js";
import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
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

  agenda.define("integration:poll-15m", async () => {
    // NOTE: this handler previously spawned a worker_threads worker, but that
    // caused Mongo contention with the dashboard-cache:refresh-15m cron (same
    // 15-min cadence) — both hit the DB concurrently and the cache cron
    // started taking ~6 minutes, freezing the site. Reverted to inline.
    // Worker plumbing is kept in place (dormant) for a future re-enable
    // alongside cron-stagger / Mongo-throughput work.
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

    /**
     * Rebuild Square order rollups (daily + derived hourly/period) for today's
     * and yesterday's business day per location. Orders arrive via webhooks,
     * not a poll-time sync, so this just closes the gap left by webhook delivery
     * jitter — the dashboard read path for any range that includes "today"
     * relies on the daily rollup being current.
     *
     * Bounded work: ~2 business-day keys × N locations × ~200ms each. The
     * 7-min stagger between this cron and dashboard-cache:refresh-15m
     * (configured in config/agenda.ts) avoids the Mongo-throughput collision
     * documented above for the worker-threads variant.
     */
    try {
      const startedAt = Date.now();
      await refreshSquareOrderRollupsAfterPoll();
      logger.info("integration:poll-15m square order rollups done", {
        totalMs: Date.now() - startedAt,
      });
    } catch (err) {
      logger.error("integration:poll-15m square order rollups failed", { err });
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

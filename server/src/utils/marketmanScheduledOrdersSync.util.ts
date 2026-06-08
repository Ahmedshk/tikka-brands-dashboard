import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import { refreshRollupsAfterManualSyncSingleResource } from "../services/integrationPollRollupRefresh.service.js";
import { runSyncForAllLocations } from "../services/integrationSyncRunner.service.js";
import { logger } from "./logger.util.js";
import {
  marketManMonthlySyncWindowDenver,
  scheduledMarketManOrdersDailyDedupeMessage,
} from "./marketmanMonthlySyncWindow.util.js";

export type MarketManScheduledOrdersSyncContext =
  | "scheduled_three_am"
  | "catch_up_startup";

export async function hasSuccessfulScheduledMarketManOrdersDailyToday(
  referenceUtc: Date = new Date(),
): Promise<boolean> {
  const window = marketManMonthlySyncWindowDenver(referenceUtc);
  const existing = await IntegrationSyncLogModel.findOne({
    resource: "marketman_orders_both",
    status: "success",
    message: scheduledMarketManOrdersDailyDedupeMessage(window.denverDateKey),
  }).exec();
  return existing != null;
}

/**
 * Daily backfill: previous month + current month (padded) in America/Denver.
 * Mirrors manual Data Sync `marketman_orders_both` with computed date range.
 */
export async function runMarketManOrdersBothMonthWindowSync(
  context: MarketManScheduledOrdersSyncContext,
  referenceUtc: Date = new Date(),
): Promise<void> {
  const window = marketManMonthlySyncWindowDenver(referenceUtc);
  const dedupeMessage = scheduledMarketManOrdersDailyDedupeMessage(window.denverDateKey);

  if (await hasSuccessfulScheduledMarketManOrdersDailyToday(referenceUtc)) {
    logger.info("marketman_orders_both scheduled daily: skipped (already succeeded today)", {
      context,
      denverDateKey: window.denverDateKey,
    });
    return;
  }

  const startedAt = Date.now();
  logger.info("marketman_orders_both scheduled daily: syncing", {
    context,
    denverDateKey: window.denverDateKey,
    denverMonthKey: window.denverMonthKey,
    startDateKey: window.startDateKey,
    endDateKey: window.endDateKey,
    startDateIso: window.startDateIso,
    endDateIso: window.endDateIso,
  });

  try {
    const result = await runSyncForAllLocations("marketman_orders_both", {
      startDate: window.startDateIso,
      endDate: window.endDateIso,
    });

    const anyErrors = Object.values(result.byLocation).some((c) => c.errors.length > 0);

    if (!anyErrors) {
      try {
        await refreshRollupsAfterManualSyncSingleResource("marketman_orders_both", {
          startTrim: window.startDateIso,
          endTrim: window.endDateIso,
        });
      } catch (rollErr) {
        logger.error("marketman_orders_both scheduled daily: rollup refresh failed", {
          context,
          err: rollErr,
        });
      }
    }

    await IntegrationSyncLogModel.create({
      resource: "marketman_orders_both",
      locationIds: [],
      status: anyErrors ? "failed" : "success",
      startDate: window.startDateIso,
      endDate: window.endDateIso,
      message: anyErrors
        ? `${dedupeMessage} | ${Object.entries(result.byLocation)
            .filter(([, v]) => v.errors.length)
            .map(([id, v]) => `${id}: ${v.errors.join("; ")}`)
            .join(" | ")}`
        : dedupeMessage,
      counts: {
        totalUpserted: result.totalUpserted,
        locations: Object.keys(result.byLocation).length,
        durationMs: Date.now() - startedAt,
      },
      byLocation: result.byLocation,
    });

    logger.info("marketman_orders_both scheduled daily: done", {
      context,
      denverDateKey: window.denverDateKey,
      totalUpserted: result.totalUpserted,
      durationMs: Date.now() - startedAt,
      anyErrors,
    });
  } catch (err) {
    logger.error("marketman_orders_both scheduled daily: failed", { context, err });
    try {
      await IntegrationSyncLogModel.create({
        resource: "marketman_orders_both",
        locationIds: [],
        status: "failed",
        startDate: window.startDateIso,
        endDate: window.endDateIso,
        message: err instanceof Error ? err.message : String(err),
        counts: { durationMs: Date.now() - startedAt },
      });
    } catch (logErr) {
      logger.error("marketman_orders_both scheduled daily: failed to write log", {
        context,
        err: logErr,
      });
    }
  }
}

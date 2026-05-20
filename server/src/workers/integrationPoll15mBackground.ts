import { runSyncForAllLocations } from "../services/integrationSyncRunner.service.js";
import {
  refreshHomebaseRollupsAfterPoll,
  refreshMarketManRollupsAfterPoll,
} from "../services/integrationPollRollupRefresh.service.js";
import {
  isDenverEightAmWindow,
  syncMarketManValidCountDatesForTodayDenverIfMissing,
} from "../jobs/integration.jobs.js";
import { logger } from "../utils/logger.util.js";

/**
 * Worker-thread entry for the scheduled 15-minute integration poll. The
 * agenda handler `integration:poll-15m` now just spawns this background
 * function instead of running the sync + rollup work inline on the main
 * thread, so HTTP requests don't hitch every 15 minutes.
 *
 * Mirrors the logic that previously lived in `agenda.define("integration:poll-15m", ...)`:
 * never throws (each segment has its own try/catch and logs to winston), so
 * the worker entry can call it safely.
 */
export async function integrationPoll15mBackground(): Promise<void> {
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
}

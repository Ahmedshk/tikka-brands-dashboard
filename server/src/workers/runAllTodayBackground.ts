import { runSyncAllResourcesForToday } from "../services/integrationSyncRunner.service.js";
import { refreshDailyRollupsAfterRunAllToday } from "../services/integrationPollRollupRefresh.service.js";
import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import { logger } from "../utils/logger.util.js";
import { updateSyncLogProgress } from "../utils/integrationSyncProgress.util.js";

/**
 * Executes the "run all resources for today" sync against an already-created
 * IntegrationSyncLog. Errors are persisted to the log; this function never
 * throws so it is safe to call from both the controller (legacy path) and the
 * worker_threads entry point.
 */
export async function runAllTodayBackground(logId: string): Promise<void> {
  try {
    const { steps, totalUpserted, allOk } = await runSyncAllResourcesForToday({
      onProgress: (p) => updateSyncLogProgress(logId, p),
    });
    try {
      await refreshDailyRollupsAfterRunAllToday();
    } catch (err) {
      logger.error("runAllTodayBackground: rollup refresh failed", { err });
    }
    const failed = steps.filter((s) => !s.ok).map((s) => s.resource);
    await IntegrationSyncLogModel.findByIdAndUpdate(logId, {
      status: allOk ? "success" : "failed",
      message:
        failed.length > 0 ? `Failed steps: ${failed.join(", ")}` : undefined,
      counts: {
        totalUpserted,
        steps: steps.length,
        failedSteps: failed.length,
      },
    }).exec();
  } catch (err) {
    logger.error("runAllTodayBackground failed", { err, logId });
    try {
      await IntegrationSyncLogModel.findByIdAndUpdate(logId, {
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      }).exec();
    } catch (updateErr) {
      logger.error("runAllTodayBackground: log status update failed", {
        err: updateErr,
        logId,
      });
    }
  }
}

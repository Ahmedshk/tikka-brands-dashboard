import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import { logger } from "./logger.util.js";

const STALE_AFTER_MS = 60 * 60 * 1000;
const STALE_MESSAGE =
  "Sync timed out (no progress updates for 60 minutes — server may have restarted)";

/**
 * Marks any IntegrationSyncLog rows that have been stuck in `started` with no
 * heartbeat (updatedAt bump) for more than 10 minutes as `failed`. Safe to call
 * before reads against the active/list endpoints.
 */
export async function sweepStaleStartedLogs(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS);
    await IntegrationSyncLogModel.updateMany(
      { status: "started", updatedAt: { $lt: cutoff } },
      { status: "failed", message: STALE_MESSAGE },
    ).exec();
  } catch (err) {
    logger.error("sweepStaleStartedLogs failed", { err });
  }
}

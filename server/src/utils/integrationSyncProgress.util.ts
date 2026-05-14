import type { Types } from "mongoose";
import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import type { IntegrationSyncProgress } from "../models/integrationSyncLog.model.js";
import { logger } from "./logger.util.js";

/**
 * Bumps progress on a started IntegrationSyncLog. Each update also touches
 * `updatedAt`, which serves as the heartbeat consulted by the stale sweeper.
 */
export async function updateSyncLogProgress(
  logId: string | Types.ObjectId,
  progress: IntegrationSyncProgress,
): Promise<void> {
  try {
    await IntegrationSyncLogModel.findByIdAndUpdate(logId, { progress }).exec();
  } catch (err) {
    logger.error("updateSyncLogProgress failed", { err, logId: String(logId) });
  }
}

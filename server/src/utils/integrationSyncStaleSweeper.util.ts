import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import { logger } from "./logger.util.js";

const STALE_AFTER_MS = 60 * 60 * 1000;
const SWEEP_THROTTLE_MS = 60 * 1000;
const STALE_MESSAGE =
  "Sync timed out (no progress updates for 60 minutes — server may have restarted)";

let lastSweepAt = 0;
let sweepInFlight: Promise<void> | null = null;

async function runSweep(): Promise<void> {
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

/**
 * Marks IntegrationSyncLog rows stuck in `started` (no heartbeat for 60 min)
 * as `failed`. Throttled to at most once per minute so that frequent polls of
 * /active and /logs don't trigger an updateMany on every request — this keeps
 * the hot polling path off the Mongo write pool.
 */
export async function sweepStaleStartedLogs(): Promise<void> {
  const now = Date.now();
  if (sweepInFlight) return sweepInFlight;
  if (now - lastSweepAt < SWEEP_THROTTLE_MS) return;
  lastSweepAt = now;
  sweepInFlight = runSweep().finally(() => {
    sweepInFlight = null;
  });
  return sweepInFlight;
}

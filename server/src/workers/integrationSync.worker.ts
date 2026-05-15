import { workerData, parentPort } from "node:worker_threads";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { runManualIntegrationSyncBackground } from "../utils/integrationSyncControllerHelpers.util.js";
import { runAllTodayBackground } from "./runAllTodayBackground.js";
import { logger } from "../utils/logger.util.js";
import type { IntegrationSyncWorkerMsg } from "./integrationSyncWorker.types.js";

/**
 * worker_threads entry for integration syncs. The main thread spawns one of
 * these per manual sync via spawnIntegrationSyncWorker; the worker runs the
 * sync to completion on its own OS thread (and a separate Mongoose
 * connection) so the HTTP event loop never blocks on heavy upserts or
 * JSON.parse work.
 *
 * Progress and final status are written directly to IntegrationSyncLog by
 * the existing helpers, so the main thread does not need to forward any
 * messages back - it just observes via /api/integration-sync/active polls.
 */

async function main(): Promise<void> {
  const msg = workerData as IntegrationSyncWorkerMsg;
  try {
    await connectDatabase();
    if (msg.kind === "manual") {
      await runManualIntegrationSyncBackground({
        logId: msg.logId,
        body: msg.body,
      });
    } else {
      await runAllTodayBackground(msg.logId);
    }
    parentPort?.postMessage({ ok: true });
  } catch (err) {
    logger.error("integrationSync worker top-level failure", {
      err,
      logId: msg.logId,
    });
    parentPort?.postMessage({
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    try {
      await mongoose.disconnect();
    } catch (err) {
      logger.warn("integrationSync worker: mongoose disconnect failed", {
        err,
      });
    }
    process.exit(0);
  }
}

await main();

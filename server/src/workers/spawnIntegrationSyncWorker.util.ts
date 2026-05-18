import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import { resolveIntegrationSyncWorkerPath } from "../utils/integrationSyncWorkerPath.util.js";
import { logger } from "../utils/logger.util.js";
import type { IntegrationSyncWorkerMsg } from "./integrationSyncWorker.types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Limit how many sync workers can run concurrently. On a 2 vCPU B2 instance
 * we want at most: 1 main thread (HTTP) + 1-2 sync workers, leaving room
 * for the libuv pool, GC, and nginx upstream traffic without contention.
 */
const MAX_CONCURRENT_WORKERS = 2;

/**
 * Backstop in case a worker stops responding (process.exit not reached,
 * deadlock, etc). Force-terminates and frees its slot in `liveWorkers`.
 * 90 minutes is comfortably longer than any real sync we have observed.
 */
const HARD_TIMEOUT_MS = 90 * 60 * 1000;

const liveWorkers = new Set<Worker>();

export function getActiveSyncWorkerCount(): number {
  return liveWorkers.size;
}

/**
 * Stops every running integration sync worker. Wire this into the server
 * shutdown handler so Azure restarts don't leak background threads.
 */
export async function terminateAllSyncWorkers(): Promise<void> {
  const workers = Array.from(liveWorkers);
  await Promise.all(workers.map((w) => w.terminate().catch(() => undefined)));
  liveWorkers.clear();
}

/**
 * Spawns the integration-sync worker for the given payload. Returns
 * synchronously; the worker runs to completion on its own OS thread and
 * updates the IntegrationSyncLog via Mongo directly.
 *
 * If the concurrency cap is hit, the sync log is marked failed with a clear
 * message instead of overloading the box.
 */
export function spawnIntegrationSyncWorker(
  message: IntegrationSyncWorkerMsg,
): { spawned: boolean; reason?: string } {
  if (liveWorkers.size >= MAX_CONCURRENT_WORKERS) {
    const reason = `Too many concurrent syncs (cap=${MAX_CONCURRENT_WORKERS}); try again when one finishes`;
    logger.warn("spawnIntegrationSyncWorker rejected", {
      reason,
      logId: message.logId,
    });
    void IntegrationSyncLogModel.findByIdAndUpdate(message.logId, {
      status: "failed",
      message: reason,
    })
      .exec()
      .catch((err: unknown) => {
        logger.error(
          "spawnIntegrationSyncWorker: failed to mark log as rejected",
          { err, logId: message.logId },
        );
      });
    return { spawned: false, reason };
  }

  const workerPath = resolveIntegrationSyncWorkerPath(__dirname);
  const worker = new Worker(workerPath, { workerData: message });
  liveWorkers.add(worker);

  // Belt-and-braces: if a worker ever fails to fire `exit` (e.g. deadlock
  // in cleanup, hung native module), force-terminate it after a generous
  // timeout so the concurrency cap recovers on its own. `.unref()` keeps
  // this timer from holding the process open during graceful shutdown.
  const hardKill = setTimeout(() => {
    logger.warn("integrationSync worker hard-terminated by timeout", {
      logId: message.logId,
      timeoutMs: HARD_TIMEOUT_MS,
    });
    void worker.terminate();
  }, HARD_TIMEOUT_MS);
  hardKill.unref();

  const releaseSlot = (): void => {
    liveWorkers.delete(worker);
    clearTimeout(hardKill);
  };

  worker.on("error", (err: Error) => {
    logger.error("integrationSync worker error", { err, logId: message.logId });
    void IntegrationSyncLogModel.findByIdAndUpdate(message.logId, {
      status: "failed",
      message: err.message,
    })
      .exec()
      .catch((updateErr: unknown) => {
        logger.error("integrationSync worker: failed to update log on error", {
          err: updateErr,
          logId: message.logId,
        });
      });
    // Some failure modes emit `error` without a clean `exit`; release the
    // slot eagerly so the cap doesn't accumulate ghost workers.
    releaseSlot();
  });

  worker.on("exit", (code) => {
    releaseSlot();
    if (code !== 0) {
      logger.warn("integrationSync worker exit", {
        code,
        logId: message.logId,
      });
    }
  });

  return { spawned: true };
}

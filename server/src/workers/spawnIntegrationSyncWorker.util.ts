import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import {
  integrationSyncWorkerSpawnOptions,
  resolveIntegrationSyncWorkerPath,
} from "../utils/integrationSyncWorkerPath.util.js";
import { logger } from "../utils/logger.util.js";
import type { IntegrationSyncWorkerMsg } from "./integrationSyncWorker.types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Single-slot pools, one per worker kind. On a 2 vCPU B2 instance this gives
 * us at most: 1 main thread (HTTP) + 1 manual sync worker + 1 scheduled poll
 * worker, which fits the box cleanly without thread contention.
 *
 * The pools are intentionally independent so the scheduled poll can never be
 * starved by user-triggered manual syncs (and vice versa).
 */
const MAX_MANUAL_WORKERS = 1;
const MAX_POLL_WORKERS = 1;

/**
 * Backstop in case a worker stops responding (process.exit not reached,
 * deadlock, etc). Force-terminates and frees its slot.
 * 90 minutes is comfortably longer than any real sync we have observed.
 */
const HARD_TIMEOUT_MS = 90 * 60 * 1000;

const liveManualWorkers = new Set<Worker>();
const livePollWorkers = new Set<Worker>();

export function getActiveSyncWorkerCount(): number {
  return liveManualWorkers.size + livePollWorkers.size;
}

/**
 * Stops every running integration sync worker (manual + poll). Wire this into
 * the server shutdown handler so Azure restarts don't leak background threads.
 */
export async function terminateAllSyncWorkers(): Promise<void> {
  const workers = [
    ...Array.from(liveManualWorkers),
    ...Array.from(livePollWorkers),
  ];
  await Promise.all(workers.map((w) => w.terminate().catch(() => undefined)));
  liveManualWorkers.clear();
  livePollWorkers.clear();
}

interface WorkerLifecycleOptions {
  pool: Set<Worker>;
  logContext: Record<string, unknown>;
  onErrorLog?: (err: Error) => void;
}

/**
 * Wires up the shared worker lifecycle: hard-kill timer, slot release on
 * exit/error, and consistent pino logging. Extracted so both spawn helpers
 * (manual and poll) stay short and don't drift.
 */
function attachWorkerLifecycle(
  worker: Worker,
  opts: WorkerLifecycleOptions,
): void {
  opts.pool.add(worker);

  // Belt-and-braces: if a worker ever fails to fire `exit` (e.g. deadlock
  // in cleanup, hung native module), force-terminate it after a generous
  // timeout so the slot recovers on its own. `.unref()` keeps this timer
  // from holding the process open during graceful shutdown.
  const hardKill = setTimeout(() => {
    logger.warn("integrationSync worker hard-terminated by timeout", {
      ...opts.logContext,
      timeoutMs: HARD_TIMEOUT_MS,
    });
    void worker.terminate();
  }, HARD_TIMEOUT_MS);
  hardKill.unref();

  const releaseSlot = (): void => {
    opts.pool.delete(worker);
    clearTimeout(hardKill);
  };

  worker.on("error", (err: Error) => {
    logger.error("integrationSync worker error", {
      err,
      ...opts.logContext,
    });
    opts.onErrorLog?.(err);
    // Some failure modes emit `error` without a clean `exit`; release the
    // slot eagerly so the cap doesn't accumulate ghost workers.
    releaseSlot();
  });

  worker.on("exit", (code) => {
    releaseSlot();
    if (code !== 0) {
      logger.warn("integrationSync worker exit", {
        code,
        ...opts.logContext,
      });
    }
  });
}

/**
 * Spawns the integration-sync worker for a manual or all-today payload.
 * Returns synchronously; the worker runs to completion on its own OS thread
 * and updates the IntegrationSyncLog via Mongo directly.
 *
 * If a manual sync is already running, returns `{ spawned: false }` so the
 * caller (HTTP controller) can respond with 429. We intentionally do NOT
 * write a "failed" IntegrationSyncLog row on rejection — the 429 is the
 * user-facing signal and a noisy log entry every time someone double-clicks
 * is not what we want in Recent runs.
 */
export function spawnIntegrationSyncWorker(
  message: IntegrationSyncWorkerMsg,
): { spawned: boolean; reason?: string } {
  if (message.kind === "poll-15m") {
    // Programmer error — manual/all-today path only.
    return {
      spawned: false,
      reason: "spawnIntegrationSyncWorker: poll-15m must use spawnPoll15mWorker",
    };
  }

  if (liveManualWorkers.size >= MAX_MANUAL_WORKERS) {
    const reason = "Another sync is already in progress";
    logger.warn("spawnIntegrationSyncWorker rejected", {
      reason,
      logId: message.logId,
    });
    return { spawned: false, reason };
  }

  const workerTarget = resolveIntegrationSyncWorkerPath(__dirname);
  const worker = new Worker(
    workerTarget.path,
    integrationSyncWorkerSpawnOptions(workerTarget, message),
  );
  attachWorkerLifecycle(worker, {
    pool: liveManualWorkers,
    logContext: { logId: message.logId, kind: message.kind },
    onErrorLog: (err) => {
      // Worker crashed mid-run (not a rejection). The "started" log row
      // already exists in IntegrationSyncLog — flip it to failed so the UI
      // doesn't show a zombie "in progress" entry forever.
      void IntegrationSyncLogModel.findByIdAndUpdate(message.logId, {
        status: "failed",
        message: err.message,
      })
        .exec()
        .catch((updateErr: unknown) => {
          logger.error(
            "integrationSync worker: failed to update log on error",
            { err: updateErr, logId: message.logId },
          );
        });
    },
  });

  return { spawned: true };
}

/**
 * Spawns the integration-sync worker for the scheduled 15-minute poll.
 * If a previous poll is still running when this is called (slow tick,
 * Mongo latency spike, etc.), we **skip this tick** — no DB write, no
 * failed log row. The next tick will pick it up.
 */
export function spawnPoll15mWorker(): { spawned: boolean; reason?: string } {
  if (livePollWorkers.size >= MAX_POLL_WORKERS) {
    return { spawned: false, reason: "previous poll still running" };
  }

  const workerTarget = resolveIntegrationSyncWorkerPath(__dirname);
  const message: IntegrationSyncWorkerMsg = { kind: "poll-15m" };
  const worker = new Worker(
    workerTarget.path,
    integrationSyncWorkerSpawnOptions(workerTarget, message),
  );
  attachWorkerLifecycle(worker, {
    pool: livePollWorkers,
    logContext: { kind: "poll-15m" },
  });

  return { spawned: true };
}

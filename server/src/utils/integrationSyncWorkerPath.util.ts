import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface IntegrationSyncWorkerTarget {
  /** Absolute path or file URL (tsx workers use a file URL). */
  path: string;
  /** When true, spawn the worker with `execArgv: ['--import', 'tsx']`. */
  useTsx: boolean;
}

/**
 * Resolves the integration-sync worker entry file.
 *
 * Production (`node dist/server.js`): worker lives next to this helper under
 * `dist/workers/integrationSync.worker.js`.
 *
 * Dev (`tsx watch src/server.ts`): prefer compiled `dist/workers/` so worker
 * imports resolve the same as production. Source `.ts` is only used when dist
 * is missing (run `npm run build` in server/).
 */
export function resolveIntegrationSyncWorkerPath(
  workersDir: string,
): IntegrationSyncWorkerTarget {
  const adjacentJs = path.join(workersDir, "integrationSync.worker.js");
  if (fs.existsSync(adjacentJs)) {
    return { path: adjacentJs, useTsx: false };
  }

  const serverRoot = path.join(workersDir, "..", "..");
  const distWorker = path.join(
    serverRoot,
    "dist",
    "workers",
    "integrationSync.worker.js",
  );
  if (fs.existsSync(distWorker)) {
    return { path: distWorker, useTsx: false };
  }

  const adjacentTs = path.join(workersDir, "integrationSync.worker.ts");
  if (fs.existsSync(adjacentTs)) {
    return { path: pathToFileURL(adjacentTs).href, useTsx: true };
  }

  throw new Error(
    `integrationSync.worker not found. Run "npm run build" in server/. ` +
      `Checked: ${adjacentJs}, ${distWorker}, ${adjacentTs}`,
  );
}

export function integrationSyncWorkerSpawnOptions(
  target: IntegrationSyncWorkerTarget,
  workerData: unknown,
): { workerData: unknown; execArgv?: string[] } {
  return {
    workerData,
    ...(target.useTsx ? { execArgv: ["--import", "tsx"] } : {}),
  };
}

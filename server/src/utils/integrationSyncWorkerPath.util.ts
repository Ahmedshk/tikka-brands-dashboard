import fs from "node:fs";
import path from "node:path";

/**
 * Resolves the integration-sync worker entry file.
 *
 * Production (`node dist/server.js`): worker lives next to this helper under
 * `dist/workers/integrationSync.worker.js`.
 *
 * Dev (`tsx watch src/server.ts`): main code runs from `src/workers/` but only
 * `.ts` exists there; the compiled worker is under `dist/workers/`. Run
 * `npm run build` in server/ so that file exists before triggering a sync.
 */
export function resolveIntegrationSyncWorkerPath(workersDir: string): string {
  const adjacent = path.join(workersDir, "integrationSync.worker.js");
  if (fs.existsSync(adjacent)) {
    return adjacent;
  }

  const serverRoot = path.join(workersDir, "..", "..");
  const distWorker = path.join(
    serverRoot,
    "dist",
    "workers",
    "integrationSync.worker.js",
  );
  if (fs.existsSync(distWorker)) {
    return distWorker;
  }

  throw new Error(
    `integrationSync.worker.js not found. Run "npm run build" in server/. ` +
      `Checked: ${adjacent}, ${distWorker}`,
  );
}

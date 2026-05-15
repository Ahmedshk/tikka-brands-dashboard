import type { ManualSyncBody } from "../utils/integrationSyncControllerHelpers.util.js";

/**
 * Payload sent from the main thread to a freshly spawned
 * integrationSync.worker. The worker uses `kind` to pick which background
 * function to run.
 */
export type IntegrationSyncWorkerMsg =
  | { kind: "manual"; logId: string; body: ManualSyncBody }
  | { kind: "all-today"; logId: string };

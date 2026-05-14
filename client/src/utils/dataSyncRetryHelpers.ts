import type {
  IntegrationSyncLogRow,
  IntegrationSyncResource,
  RunIntegrationSyncBody,
} from "../services/integrationSync.service";
import { DATA_SYNC_RESOURCE_OPTIONS } from "./dataSyncResourceOptions";

const VALID_RESOURCES = new Set<string>(
  DATA_SYNC_RESOURCE_OPTIONS.map((o) => o.value),
);

const RESOURCES_NEEDING_DATE_RANGE = new Set<string>(
  DATA_SYNC_RESOURCE_OPTIONS.filter((o) => o.needsDateRange).map(
    (o) => o.value,
  ),
);

/** ObjectIds of locations whose sync errored during the row's run. */
export function getFailedLocationIds(row: IntegrationSyncLogRow): string[] {
  if (!row.byLocation) return [];
  const out: string[] = [];
  for (const [id, v] of Object.entries(row.byLocation)) {
    if (v?.errors?.length) out.push(id);
  }
  return out;
}

/** Count of locations where the row's run succeeded (errors empty). */
export function getSucceededLocationCount(row: IntegrationSyncLogRow): number {
  if (!row.byLocation) return 0;
  let n = 0;
  for (const v of Object.values(row.byLocation)) {
    if (!v?.errors?.length) n += 1;
  }
  return n;
}

/**
 * Whether the row is a candidate for a per-location retry: failed status,
 * still-supported manual resource, valid dates when required, and at least one
 * failed location id.
 */
export function canRetryLog(row: IntegrationSyncLogRow): boolean {
  if (row.status !== "failed") return false;
  if (!VALID_RESOURCES.has(row.resource)) return false;
  if (
    RESOURCES_NEEDING_DATE_RANGE.has(row.resource) &&
    (!row.startDate?.trim() || !row.endDate?.trim())
  ) {
    return false;
  }
  return getFailedLocationIds(row).length > 0;
}

/**
 * Body to send to integrationSyncService.run for retrying the failed subset
 * of a log row. Returns null when the row is not retryable (matches canRetryLog).
 */
export function buildRetryBody(
  row: IntegrationSyncLogRow,
): RunIntegrationSyncBody | null {
  if (!canRetryLog(row)) return null;
  const failed = getFailedLocationIds(row);
  const body: RunIntegrationSyncBody = {
    resource: row.resource as IntegrationSyncResource,
    locationIds: failed,
  };
  if (row.startDate?.trim()) body.startDate = row.startDate.trim();
  if (row.endDate?.trim()) body.endDate = row.endDate.trim();
  return body;
}

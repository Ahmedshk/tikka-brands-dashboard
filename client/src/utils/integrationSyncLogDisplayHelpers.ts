import type { IntegrationSyncLogRow } from "../services/integrationSync.service";

/** Human-readable resource column for sync history (log `resource` is often a snake_case key). */
export function integrationSyncLogResourceLabel(resource: string): string {
  if (resource === "all_resources_today") {
    return "All resources (today)";
  }
  return resource;
}

/** Tailwind classes for sync log status (success green, failed red, other muted). */
export function integrationSyncLogStatusClassName(status: string): string {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (s === "success") return "!text-positive font-medium";
  if (s === "failed") return "!text-negative font-medium";
  return "!text-secondary font-medium";
}

/**
 * Full text for Data Sync "Recent runs" detail column: message, counts, scope (locations, date range).
 */
export function formatIntegrationSyncLogDetails(row: IntegrationSyncLogRow): string {
  const blocks: string[] = [];

  const msg = row.message?.trim();
  if (msg) blocks.push(msg);

  const counts = row.counts;
  if (counts != null && Object.keys(counts).length > 0) {
    const lines = Object.entries(counts)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join("\n");
    blocks.push(lines);
  }

  if (row.locationIds?.length) {
    blocks.push(`Locations: ${row.locationIds.join(", ")}`);
  }
  if (row.startDate?.trim()) {
    blocks.push(`Start: ${row.startDate.trim()}`);
  }
  if (row.endDate?.trim()) {
    blocks.push(`End: ${row.endDate.trim()}`);
  }

  if (blocks.length === 0) return "—";
  return blocks.join("\n\n");
}

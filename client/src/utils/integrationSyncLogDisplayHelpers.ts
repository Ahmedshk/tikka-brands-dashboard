import type {
  IntegrationSyncLocationResult,
  IntegrationSyncLogRow,
} from "../services/integrationSync.service";

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
  return formatIntegrationSyncLogDetailsWithLocations(row, {});
}

function resolveLocationLabel(
  id: string,
  nameById: Record<string, string>,
): string {
  return nameById[id]?.trim() || id;
}

function formatByLocationLines(
  byLocation: Record<string, IntegrationSyncLocationResult>,
  nameById: Record<string, string>,
): { failedLines: string[]; succeededCount: number } {
  const failedLines: string[] = [];
  let succeededCount = 0;
  for (const [id, result] of Object.entries(byLocation)) {
    if (result?.errors?.length) {
      const label = resolveLocationLabel(id, nameById);
      failedLines.push(`Location ${label}: ${result.errors.join("; ")}`);
    } else {
      succeededCount += 1;
    }
  }
  return { failedLines, succeededCount };
}

/**
 * Same as {@link formatIntegrationSyncLogDetails} but uses the structured
 * `byLocation` map (when present) to render a per-location breakdown with
 * friendly location names instead of relying on the concatenated message text.
 */
export function formatIntegrationSyncLogDetailsWithLocations(
  row: IntegrationSyncLogRow,
  locationNameById: Record<string, string>,
): string {
  const blocks: string[] = [];

  const hasByLocation =
    row.byLocation != null && Object.keys(row.byLocation).length > 0;

  if (hasByLocation) {
    const { failedLines, succeededCount } = formatByLocationLines(
      row.byLocation!,
      locationNameById,
    );
    if (failedLines.length > 0) blocks.push(failedLines.join("\n"));
    if (succeededCount > 0) {
      blocks.push(`Succeeded: ${succeededCount} location(s)`);
    }
  } else {
    const msg = row.message?.trim();
    if (msg) blocks.push(msg);
  }

  const counts = row.counts;
  if (counts != null && Object.keys(counts).length > 0) {
    const lines = Object.entries(counts)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join("\n");
    blocks.push(lines);
  }

  if (!hasByLocation && row.locationIds?.length) {
    const labels = row.locationIds.map((id) =>
      resolveLocationLabel(id, locationNameById),
    );
    blocks.push(`Locations: ${labels.join(", ")}`);
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

const STATION_TYPE_LABELS: Record<string, string> = {
  kds: "Prep",
  kds_expo: "Expeditor",
};

const DISPLAY_LABELS = new Set(["Prep", "Expeditor"]);

/**
 * Map Square KDS `station_type` (or stored CSV value) to list-table display label.
 */
export function mapKitchenPerformanceStationType(
  stationType: string | null | undefined,
): string {
  const raw = stationType?.trim() ?? "";
  if (!raw) {
    return "Unknown";
  }
  if (DISPLAY_LABELS.has(raw)) {
    return raw;
  }
  const normalized = raw.toLowerCase();
  return STATION_TYPE_LABELS[normalized] ?? "Unknown";
}

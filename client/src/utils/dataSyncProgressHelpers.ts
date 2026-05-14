import type { IntegrationSyncProgress } from "../services/integrationSync.service";

/**
 * Short "currently doing X" caption for an in-progress sync. Resource totals
 * are step counts (locations, sub-resources) and not time, so we surface them
 * as context rather than as a percentage.
 */
export function formatCurrentStep(progress?: IntegrationSyncProgress): string {
  if (!progress) return "Starting…";
  const { current, total, label } = progress;
  const trimmedLabel = label?.trim();
  if (total > 0) {
    return trimmedLabel
      ? `Step ${current} of ${total} · ${trimmedLabel}`
      : `Step ${current} of ${total}`;
  }
  return trimmedLabel || "Working…";
}

/** Absolute clock time the sync was started, in the viewer's locale. */
export function formatStartedAtClock(createdAtIso: string): string {
  try {
    const date = new Date(createdAtIso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString();
  } catch {
    return "";
  }
}

/** Compact elapsed duration like "42s", "3m 12s", "1h 04m". */
export function formatElapsed(createdAtIso: string): string {
  try {
    const startedMs = new Date(createdAtIso).getTime();
    if (Number.isNaN(startedMs)) return "";
    const elapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
    if (elapsedSec < 60) return `${elapsedSec}s`;
    const elapsedMin = Math.floor(elapsedSec / 60);
    const remSec = elapsedSec % 60;
    if (elapsedMin < 60) {
      return remSec === 0 ? `${elapsedMin}m` : `${elapsedMin}m ${remSec}s`;
    }
    const elapsedHr = Math.floor(elapsedMin / 60);
    const remMin = elapsedMin % 60;
    return remMin === 0
      ? `${elapsedHr}h`
      : `${elapsedHr}h ${String(remMin).padStart(2, "0")}m`;
  } catch {
    return "";
  }
}

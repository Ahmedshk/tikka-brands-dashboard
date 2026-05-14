import type { IntegrationSyncProgress } from "../services/integrationSync.service";

export function computeProgressPercent(progress?: IntegrationSyncProgress): number {
  if (!progress || progress.total <= 0) return 0;
  const pct = Math.round((progress.current / progress.total) * 100);
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

export function formatProgressLabel(progress?: IntegrationSyncProgress): string {
  if (!progress) return "Starting…";
  const { current, total, label } = progress;
  const counts = total > 0 ? `${current} / ${total}` : `${current}`;
  return label ? `${counts} · ${label}` : counts;
}

export function formatStartedAgo(createdAtIso: string): string {
  try {
    const startedMs = new Date(createdAtIso).getTime();
    if (Number.isNaN(startedMs)) return "";
    const elapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
    if (elapsedSec < 60) return `started ${elapsedSec}s ago`;
    const elapsedMin = Math.floor(elapsedSec / 60);
    if (elapsedMin < 60) {
      const remSec = elapsedSec % 60;
      return remSec === 0
        ? `started ${elapsedMin}m ago`
        : `started ${elapsedMin}m ${remSec}s ago`;
    }
    const elapsedHr = Math.floor(elapsedMin / 60);
    const remMin = elapsedMin % 60;
    return remMin === 0
      ? `started ${elapsedHr}h ago`
      : `started ${elapsedHr}h ${remMin}m ago`;
  } catch {
    return "";
  }
}

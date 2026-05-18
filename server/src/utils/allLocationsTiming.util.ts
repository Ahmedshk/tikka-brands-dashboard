/**
 * Helpers for timing all-locations dashboard handlers.
 *
 * Each per-location task is timed via {@link timedPerLocation}; the resulting
 * latencies are summarized via {@link summarizeAllLocationsTimings} and
 * surfaced as a single `[all-locations]` log line per request. The intent is
 * to confirm Phase 1 parallelization is paying off — `totalMs` should track
 * `perLocMsP95`, not `perLocMsN`.
 */
import { performance } from "node:perf_hooks";
import { logger } from "./logger.util.js";

export async function timedPerLocation<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; ms: number }> {
  const t0 = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - t0) };
}

export type PerLocationTiming = { ms: number };

function percentile(sortedMs: number[], pct: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(
    sortedMs.length - 1,
    Math.max(0, Math.floor((pct / 100) * sortedMs.length)),
  );
  return sortedMs[idx] ?? 0;
}

export function summarizeAllLocationsTimings(params: {
  route: string;
  locationCount: number;
  totalMs: number;
  perLocationMs: number[];
}): void {
  const { route, locationCount, totalMs, perLocationMs } = params;
  const sorted = [...perLocationMs].sort((a, b) => a - b);
  logger.info("[all-locations] handler done", {
    route,
    locationCount,
    totalMs,
    perLocMsP50: percentile(sorted, 50),
    perLocMsP95: percentile(sorted, 95),
    perLocMsMax: sorted.length > 0 ? (sorted.at(-1) ?? 0) : 0,
  });
}

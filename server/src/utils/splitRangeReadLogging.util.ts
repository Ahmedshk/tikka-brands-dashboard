/**
 * Small helpers to emit the `[api-data-source]` line for split-range readers.
 * Kept tiny so the parent functions stay below SonarQube's cognitive
 * complexity threshold.
 *
 * NOTE: these used to call `console.log` directly. On Azure App Service that
 * is a synchronous write to a piped stdout — each call blocked the main
 * thread ~150ms, and the per-location fan-out turned ~5 calls/location × 9
 * locations into ~6s of event-loop pacing per request (the staircase pattern
 * in `tCredsMs` instrumentation). Routing through `logger.debug` puts the
 * write on pino's worker thread and turns it default-off in production,
 * removing the hot-path cost entirely while keeping the audit trail
 * available in dev / via LOG_CONSOLE_LEVEL=debug.
 */
import { logger } from "./logger.util.js";

type SplitOutcome = {
  presentKeyCount: number;
  uncoveredRangeCount: number;
  /**
   * When set, indicates how many of the uncovered sub-ranges were satisfied
   * by the hourly-rollup summer (vs. requiring a tertiary raw-data scan).
   * Lets us see in the log whether the hot path actually stayed off Mongo
   * for the partial-day tail. Defaults treated as "not applicable".
   */
  hourlyServedRangeCount?: number;
  /** Companion to `hourlyServedRangeCount`. */
  rawScannedRangeCount?: number;
};

export function logSplitRangeReadOutcome(
  logContext: string | undefined,
  sourceField: string,
  rollupOnlyDetail: string,
  splitDetailLabel: string,
  outcome: SplitOutcome,
): void {
  if (!logContext) return;
  const isPureRollup = outcome.uncoveredRangeCount === 0;
  const baseDetail = isPureRollup
    ? rollupOnlyDetail
    : `${rollupOnlyDetail.replace(/\s\(.*\)$/, "")} for ${outcome.presentKeyCount} days + ${splitDetailLabel} scan for ${outcome.uncoveredRangeCount} uncovered sub-range(s)`;
  // Extend the detail with hourly/raw breakdown when we have it — quick way
  // to confirm in production logs that the hourly path absorbed the tail
  // instead of falling through to the raw scan.
  const hourlySuffix =
    outcome.hourlyServedRangeCount != null && outcome.rawScannedRangeCount != null
      ? ` [hourly-rollup-served=${outcome.hourlyServedRangeCount}, raw-scanned=${outcome.rawScannedRangeCount}]`
      : "";
  logger.debug(`[api-data-source] ${logContext}`, {
    [sourceField]: isPureRollup
      ? "rollups"
      : `rollups+${splitDetailLabel}_split`,
    detail: `${baseDetail}${hourlySuffix}`,
  });
}

export function logSplitRangeMiss(
  logContext: string | undefined,
  sourceField: string,
  fallbackSource: string,
  detail: string,
): void {
  if (!logContext) return;
  logger.debug(`[api-data-source] ${logContext}`, {
    [sourceField]: fallbackSource,
    detail,
  });
}

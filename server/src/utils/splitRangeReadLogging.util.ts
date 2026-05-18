/**
 * Small helpers to emit the `[api-data-source]` line for split-range readers.
 * Kept tiny so the parent functions stay below SonarQube's cognitive
 * complexity threshold.
 */

type SplitOutcome = {
  presentKeyCount: number;
  uncoveredRangeCount: number;
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
  console.log("[api-data-source]", logContext, {
    [sourceField]: isPureRollup
      ? "rollups"
      : `rollups+${splitDetailLabel}_split`,
    detail: isPureRollup
      ? rollupOnlyDetail
      : `${rollupOnlyDetail.replace(/\s\(.*\)$/, "")} for ${outcome.presentKeyCount} days + ${splitDetailLabel} scan for ${outcome.uncoveredRangeCount} uncovered sub-range(s)`,
  });
}

export function logSplitRangeMiss(
  logContext: string | undefined,
  sourceField: string,
  fallbackSource: string,
  detail: string,
): void {
  if (!logContext) return;
  console.log("[api-data-source]", logContext, {
    [sourceField]: fallbackSource,
    detail,
  });
}

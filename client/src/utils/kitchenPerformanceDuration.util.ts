/** Floors sub-second KDS durations to match Square's kitchen performance UI. */
export function computeKitchenPerformanceCompletionSeconds(
  startedAt: string | null,
  completedAt: string | null,
): number | null {
  if (!startedAt?.trim() || !completedAt?.trim()) return null;

  const startedMs = new Date(startedAt.trim().replace(" ", "T")).getTime();
  const completedMs = new Date(completedAt.trim().replace(" ", "T")).getTime();
  if (Number.isNaN(startedMs) || Number.isNaN(completedMs)) return null;

  const elapsedMs = completedMs - startedMs;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;

  return Math.floor(elapsedMs / 1000);
}

/** Ticket/station averages: Square floors the mean (e.g. 760.5 → 12:40). */
export function averageKdsTicketCompletionSeconds(times: number[]): number | null {
  if (times.length === 0) return null;
  const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
  return Math.floor(mean);
}

export function getTicketCompletionTimeForDisplay(row: {
  completionTimeSeconds: number | null;
  timeCreated: string | null;
  timeCompleted: string | null;
}): number | null {
  return (
    computeKitchenPerformanceCompletionSeconds(row.timeCreated, row.timeCompleted) ??
    row.completionTimeSeconds
  );
}

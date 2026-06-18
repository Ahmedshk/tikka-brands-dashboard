import { getEffectiveKitchenPerformanceTimeDue } from "./kitchenPerformanceTimeDue.util";

function parseTicketDisplayInstant(value: string | null): number | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value.trim().replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

export function isCompletedAfterDue(
  timeCompleted: string | null,
  timeDue: string | null,
): boolean {
  const completedMs = parseTicketDisplayInstant(timeCompleted);
  const dueMs = parseTicketDisplayInstant(timeDue);
  if (completedMs == null || dueMs == null) return false;
  return completedMs > dueMs;
}

export function isTicketCompletedLate(row: {
  isLate?: boolean | null;
  timeCompleted: string | null;
  timeDue: string | null;
  timeCreated?: string | null;
}): boolean {
  const effectiveTimeDue = getEffectiveKitchenPerformanceTimeDue(
    row.timeDue,
    row.timeCreated ?? null,
  );
  if (effectiveTimeDue == null) return false;
  if (row.isLate != null) return row.isLate;
  return isCompletedAfterDue(row.timeCompleted, effectiveTimeDue);
}

export function getTicketTimeDueForDisplay(row: {
  timeDue: string | null;
  timeCreated: string | null;
}): string | null {
  return getEffectiveKitchenPerformanceTimeDue(row.timeDue, row.timeCreated);
}

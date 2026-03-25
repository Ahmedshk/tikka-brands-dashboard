import type { ReviewCycle } from "../types/review.types";

export function getReviewCycleEmployeeId(cycle: ReviewCycle | null | undefined): string | null {
  if (!cycle?.employeeId) return null;
  const e = cycle.employeeId;
  if (typeof e === "object" && e._id) return e._id;
  if (typeof e === "string" && e.trim()) return e.trim();
  return null;
}

/** Most recent first for past-review lists. */
export function sortPastReviewCyclesByRecentFirst(cycles: ReviewCycle[]): ReviewCycle[] {
  const t = (c: ReviewCycle) => {
    const completed = c.completedAt ? new Date(c.completedAt).getTime() : 0;
    if (!Number.isNaN(completed) && completed > 0) return completed;
    const updated = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
    if (!Number.isNaN(updated) && updated > 0) return updated;
    const due = c.dueDate90 ? new Date(c.dueDate90).getTime() : 0;
    return Number.isNaN(due) ? 0 : due;
  };
  return [...cycles].sort((a, b) => t(b) - t(a));
}

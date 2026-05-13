/**
 * Port of client training segment logic (date-only UTC) for overdue detection.
 */

function toDateOnly(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function compareDateOnly(a: Date, b: Date): number {
  const t1 = a.getTime();
  const t2 = b.getTime();
  if (t1 < t2) return -1;
  if (t1 > t2) return 1;
  return 0;
}

export function assignmentHasOverdueModule(
  assignedAt: string,
  moduleDurations: number[],
  moduleProgress: Array<{ completedAt: string | null; status: string }>,
): boolean {
  const today = todayDateOnly();
  const start = toDateOnly(assignedAt);
  let currentStart = start;

  for (let i = 0; i < moduleDurations.length; i++) {
    const duration = Math.max(1, moduleDurations[i] ?? 1);
    const endDate = addDays(currentStart, duration - 1);
    const prog = moduleProgress[i];
    const isCompleted = prog?.status === "completed";

    if (isCompleted) {
      const completedAt = prog?.completedAt ? toDateOnly(prog.completedAt) : endDate;
      currentStart = addDays(completedAt, 1);
    } else {
      const notStarted = !prog || prog.status === "not_started";
      if (notStarted) {
        // gray — not overdue by segment rules
      } else if (compareDateOnly(today, endDate) > 0) {
        return true;
      }
    }
  }

  return false;
}

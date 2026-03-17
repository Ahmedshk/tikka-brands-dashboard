/**
 * On-track progress and module date helpers for employee training.
 * All date logic uses date-only (start of day) to avoid timezone issues.
 */

export type SegmentStatus = 'green' | 'yellow' | 'red' | 'gray';

export type ModuleDisplayStatus =
  | 'completed_on_time'
  | 'completed_late'
  | 'in_progress'
  | 'not_started';

export interface ModuleProgressListItem {
  completedAt: string | null;
  status: string;
}

export interface ModuleDateRange {
  startDate: Date;
  endDate: Date;
  status: ModuleDisplayStatus;
  completedAt?: string;
}

/** Parse ISO date string to date-only (UTC start of day). */
function toDateOnly(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Today as date-only (UTC). */
function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Add days to a date-only (returns new date-only). */
function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** Compare two date-only values: -1 if a < b, 0 if equal, 1 if a > b. */
function compareDateOnly(a: Date, b: Date): number {
  const t1 = a.getTime();
  const t2 = b.getTime();
  if (t1 < t2) return -1;
  if (t1 > t2) return 1;
  return 0;
}

/**
 * Returns segment status for each module (green/yellow/red/gray) for the progress bar.
 * - Green: module completed (on time or late).
 * - Yellow: in progress and today <= endDate.
 * - Red: in progress and today > endDate.
 * - Gray: not started.
 */
export function getModuleSegmentStatuses(
  assignedAt: string,
  moduleDurations: number[],
  moduleProgress: ModuleProgressListItem[]
): SegmentStatus[] {
  const today = todayDateOnly();
  const start = toDateOnly(assignedAt);
  const statuses: SegmentStatus[] = [];
  let currentStart = start;

  for (let i = 0; i < moduleDurations.length; i++) {
    const duration = Math.max(1, moduleDurations[i] ?? 1);
    const endDate = addDays(currentStart, duration - 1);
    const prog = moduleProgress[i];
    const isCompleted = prog?.status === 'completed';

    if (isCompleted) {
      statuses.push('green');
      const completedAt = prog.completedAt ? toDateOnly(prog.completedAt) : endDate;
      currentStart = addDays(completedAt, 1);
    } else {
      const notStarted = !prog || prog.status === 'not_started';
      if (notStarted) {
        statuses.push('gray');
      } else {
        const cmp = compareDateOnly(today, endDate);
        statuses.push(cmp <= 0 ? 'yellow' : 'red');
      }
    }
  }

  return statuses;
}

/**
 * Returns per-module date ranges and display status for the View modal.
 * Reuses the same date-only logic as getModuleSegmentStatuses.
 */
export function getModuleDateRanges(
  assignedAt: string,
  moduleDurations: number[],
  moduleProgress: ModuleProgressListItem[]
): ModuleDateRange[] {
  const start = toDateOnly(assignedAt);
  const result: ModuleDateRange[] = [];
  let currentStart = start;

  for (let i = 0; i < moduleDurations.length; i++) {
    const duration = Math.max(1, moduleDurations[i] ?? 1);
    const endDate = addDays(currentStart, duration - 1);
    const prog = moduleProgress[i];
    const isCompleted = prog?.status === 'completed';
    const completedAtDate = prog?.completedAt ? toDateOnly(prog.completedAt) : null;

    if (isCompleted && completedAtDate) {
      const onTime = compareDateOnly(completedAtDate, endDate) <= 0;
      result.push({
        startDate: currentStart,
        endDate,
        status: onTime ? 'completed_on_time' : 'completed_late',
        completedAt: prog.completedAt ?? undefined,
      });
      currentStart = addDays(completedAtDate, 1);
    } else if (isCompleted) {
      result.push({
        startDate: currentStart,
        endDate,
        status: 'completed_on_time',
        completedAt: undefined,
      });
      currentStart = addDays(endDate, 1);
    } else {
      const notStarted = !prog || prog.status === 'not_started';
      if (notStarted) {
        result.push({
          startDate: currentStart,
          endDate,
          status: 'not_started',
        });
      } else {
        result.push({
          startDate: currentStart,
          endDate,
          status: 'in_progress',
        });
      }
    }
  }

  return result;
}

/**
 * Compute default count period with Saturday/Sunday preference:
 * - End: Saturday of last week (week that just ended), if that date is in endDates; else fallback to latest in endDates (prefer Saturday of that week).
 * - Start: Sunday of the same week as the chosen end date, if that date is in startDates and <= end; else use the last valid start date on or before the chosen end date.
 * Dates are in yyyy-MM-dd format.
 */
export function getDefaultCountPeriod(
  startDates: string[],
  endDates: string[]
): { startDate: string | null; endDate: string | null } {
  if (endDates.length === 0) return { startDate: null, endDate: null };

  const todayISO = getTodayISO();
  const lastWeekSaturday = getPreviousWeekSaturday(todayISO);

  const endDate =
    lastWeekSaturday && endDates.includes(lastWeekSaturday)
      ? lastWeekSaturday
      : (() => {
          const sortedEnd = [...endDates].sort();
          const latestEnd = sortedEnd[sortedEnd.length - 1]!;
          return getSaturdayInWeekIfAvailable(latestEnd, endDates) ?? latestEnd;
        })();

  const sundayOfEndWeek = getSundayOfWeek(endDate);
  const startCandidates = startDates.filter((d) => d <= endDate).sort();
  if (startCandidates.length === 0) return { startDate: null, endDate };

  // Prefer Sunday of the same week as end; otherwise use last valid start date on or before end
  const startDate =
    sundayOfEndWeek &&
    startDates.includes(sundayOfEndWeek) &&
    sundayOfEndWeek <= endDate
      ? sundayOfEndWeek
      : startCandidates[startCandidates.length - 1]!;
  return { startDate, endDate };
}

/** Today's date in yyyy-MM-dd (local time). */
function getTodayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Get Sunday (start of week, Sun=0) for the week containing the given yyyy-MM-dd date. Returns yyyy-MM-dd. */
function getSundayOfWeek(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  const date = new Date(y, m, d);
  const day = date.getDay();
  const sun = new Date(date);
  sun.setDate(sun.getDate() - day);
  const sy = sun.getFullYear();
  const sm = String(sun.getMonth() + 1).padStart(2, '0');
  const sd = String(sun.getDate()).padStart(2, '0');
  return `${sy}-${sm}-${sd}`;
}

/** Get Saturday (end of week, Sun=0) for the week containing the given yyyy-MM-dd date. Returns yyyy-MM-dd. */
function getSaturdayOfWeek(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  const date = new Date(y, m, d);
  const day = date.getDay();
  const saturdayOffset = day === 6 ? 0 : (6 - day + 7) % 7;
  const sat = new Date(date);
  sat.setDate(sat.getDate() + saturdayOffset);
  const sy = sat.getFullYear();
  const sm = String(sat.getMonth() + 1).padStart(2, '0');
  const sd = String(sat.getDate()).padStart(2, '0');
  return `${sy}-${sm}-${sd}`;
}

/** If the Saturday of the week of `iso` is in `validSet`, return it; else return null. */
function getSaturdayInWeekIfAvailable(
  iso: string,
  validSet: string[]
): string | null {
  const sat = getSaturdayOfWeek(iso);
  return sat && validSet.includes(sat) ? sat : null;
}

/** Saturday of the week before the week containing the given yyyy-MM-dd date. */
function getPreviousWeekSaturday(iso: string): string | null {
  const satThisWeek = getSaturdayOfWeek(iso);
  if (!satThisWeek) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(satThisWeek);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  const date = new Date(y, m, d);
  date.setDate(date.getDate() - 7);
  const sy = date.getFullYear();
  const sm = String(date.getMonth() + 1).padStart(2, '0');
  const sd = String(date.getDate()).padStart(2, '0');
  return `${sy}-${sm}-${sd}`;
}

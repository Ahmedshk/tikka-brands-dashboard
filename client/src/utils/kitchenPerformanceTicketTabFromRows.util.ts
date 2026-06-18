import { formatInTimeZone } from "date-fns-tz";
import type {
  KitchenPerformanceHourlyPoint,
  KitchenPerformanceTicketKpis,
  KitchenPerformanceTicketRow,
} from "../types/kitchenPerformance.types";
import {
  averageKdsTicketCompletionSeconds,
  getTicketCompletionTimeForDisplay,
} from "./kitchenPerformanceDuration.util";
import {
  getTicketTimeDueForDisplay,
  isTicketCompletedLate,
} from "./kitchenPerformanceTicketLate.util";

function formatHourLabel(hour24: number): string {
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12} ${suffix}`;
}

function roundKitchenPerformanceAvgItemsPerTicket(
  value: number | null | undefined,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
}

function computeKitchenPerformanceLateKpis(
  ticketRows: Array<{
    isLate?: boolean | null;
    timeDue: string | null;
    timeCompleted: string | null;
    timeCreated: string | null;
  }>,
  completedTickets: number,
): Pick<
  KitchenPerformanceTicketKpis,
  "ticketsPastDueTime" | "ticketsWithTimeDue" | "ticketsLatePercent"
> {
  const lateCount = ticketRows.filter((ticket) =>
    isTicketCompletedLate({
      isLate: ticket.isLate,
      timeCompleted: ticket.timeCompleted,
      timeDue: ticket.timeDue,
      timeCreated: ticket.timeCreated,
    }),
  ).length;
  const withDue = ticketRows.filter(
    (ticket) => getTicketTimeDueForDisplay(ticket) != null,
  ).length;
  const denominator = completedTickets > 0 ? completedTickets : ticketRows.length;

  return {
    ticketsPastDueTime: lateCount,
    ticketsWithTimeDue: withDue,
    ticketsLatePercent:
      denominator > 0 ? Number(((lateCount / denominator) * 100).toFixed(2)) : null,
  };
}

export function computeKitchenPerformanceTicketTabKpisFromRows(
  ticketRows: KitchenPerformanceTicketRow[],
): KitchenPerformanceTicketKpis {
  const completionTimes = ticketRows
    .map((row) => getTicketCompletionTimeForDisplay(row))
    .filter((value): value is number => value != null);
  const completedTickets = completionTimes.length;

  const completedItems = ticketRows.reduce((sum, ticket) => {
    if (ticket.numberOfItems != null) return sum + ticket.numberOfItems;
    return sum;
  }, 0);

  const recalledTickets = ticketRows.filter((ticket) => ticket.timeRecalled != null).length;
  const completedTicketsForLate =
    completedTickets > 0 ? completedTickets : ticketRows.length;

  return {
    completedTickets,
    completedItems,
    avgCompletionTimeSeconds:
      completedTickets > 0
        ? averageKdsTicketCompletionSeconds(completionTimes)
        : null,
    recalledTickets,
    avgItemsPerTicket:
      completedTickets > 0
        ? roundKitchenPerformanceAvgItemsPerTicket(completedItems / completedTickets)
        : null,
    ...computeKitchenPerformanceLateKpis(ticketRows, completedTicketsForLate),
  };
}

function parseDisplayInstant(value: string | null): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value.trim().replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function computeKitchenPerformanceHourlyFromTicketRows(
  ticketRows: KitchenPerformanceTicketRow[],
  timezone: string,
): KitchenPerformanceHourlyPoint[] {
  const tz = timezone.trim();
  const counts = new Array<number>(24).fill(0);

  for (const ticket of ticketRows) {
    const completed = parseDisplayInstant(ticket.timeCompleted);
    if (!completed) continue;
    const hourStr = formatInTimeZone(completed, tz, "H");
    const hour = Number.parseInt(hourStr, 10);
    if (Number.isNaN(hour) || hour < 0 || hour > 23) continue;
    counts[hour] = (counts[hour] ?? 0) + 1;
  }

  return counts.map((completedTickets, hour24) => ({
    hour24,
    label: formatHourLabel(hour24),
    completedTickets,
  }));
}

export interface KitchenPerformanceLateKpiInput {
  isLate: boolean | null;
  timeDue: string | null;
}

export interface KitchenPerformanceLateKpis {
  ticketsPastDueTime: number;
  ticketsWithTimeDue: number;
  ticketsLatePercent: number | null;
}

/** Square's device KPI card uses late tickets / completed tickets (e.g. 4 / 64 = 6.25%). */
export function computeKitchenPerformanceLateKpis(
  ticketRows: KitchenPerformanceLateKpiInput[],
  completedTickets: number,
): KitchenPerformanceLateKpis {
  const lateCount = ticketRows.filter((ticket) => ticket.isLate === true).length;
  const withDue = ticketRows.filter((ticket) => ticket.timeDue != null).length;
  const denominator = completedTickets > 0 ? completedTickets : ticketRows.length;

  return {
    ticketsPastDueTime: lateCount,
    ticketsWithTimeDue: withDue,
    ticketsLatePercent:
      denominator > 0 ? Number(((lateCount / denominator) * 100).toFixed(2)) : null,
  };
}

export function mergeKitchenPerformanceTicketLateFlag(
  existing: boolean | null,
  incoming: boolean | null,
): boolean | null {
  if (existing === true || incoming === true) return true;
  if (existing === false && incoming === false) return false;
  return existing ?? incoming;
}

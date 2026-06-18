import { parseKdsReportingTimestamp } from "./kitchenPerformanceTimestamp.util.js";

/**
 * Square's KDS UI floors sub-second durations before aggregating min/avg/max.
 * Reporting API measures like `avg_ticket_time_seconds` round each ticket first, which can
 * read 1 second higher (e.g. 745.742s displays as 12:25 in Square but API returns 746).
 */
export function computeKdsCompletionSeconds(
  displayOnKdsAt: string | null,
  completedAt: string | null,
): number | null {
  const started = parseKdsReportingTimestamp(displayOnKdsAt);
  const completed = parseKdsReportingTimestamp(completedAt);
  if (started == null || completed == null) return null;

  const elapsedMs = completed.getTime() - started.getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;

  return Math.floor(elapsedMs / 1000);
}

/** @deprecated Use {@link computeKdsCompletionSeconds}. */
export const computeKdsItemCompletionSeconds = computeKdsCompletionSeconds;

/** Ticket/station averages: Square floors the mean (e.g. 760.5 → 12:40). */
export function averageKdsTicketCompletionSeconds(times: number[]): number | null {
  if (times.length === 0) return null;
  const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
  return Math.floor(mean);
}

/**
 * Item performance averages: Square floors the mean unless the fractional second
 * is high (e.g. 940.888 → 15:41, but 729.583 → 12:09).
 */
export function averageKdsItemCompletionSeconds(times: number[]): number | null {
  if (times.length === 0) return null;
  const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
  const floorMean = Math.floor(mean);
  const roundMean = Math.round(mean);
  if (roundMean === floorMean) return floorMean;

  const fraction = mean - floorMean;
  return fraction >= 0.85 ? roundMean : floorMean;
}

/** @deprecated Use {@link averageKdsTicketCompletionSeconds}. */
export const averageKdsCompletionSeconds = averageKdsTicketCompletionSeconds;

export interface ItemPerformanceAggregate {
  completionTimes: number[];
  totalQuantity: number;
}

export function accumulateItemPerformanceAggregate(
  aggregate: ItemPerformanceAggregate,
  completionTimeSeconds: number | null,
  quantity: number,
): void {
  aggregate.totalQuantity += Math.max(0, Math.round(quantity));
  if (completionTimeSeconds == null) return;
  aggregate.completionTimes.push(completionTimeSeconds);
}

export function finalizeItemPerformanceAggregate(aggregate: ItemPerformanceAggregate): {
  avgCompletionTimeSeconds: number | null;
  minCompletionTimeSeconds: number | null;
  maxCompletionTimeSeconds: number | null;
  totalQuantity: number;
} {
  const times = aggregate.completionTimes;
  const minCompletionTimeSeconds = times.length > 0 ? Math.min(...times) : null;
  const maxCompletionTimeSeconds = times.length > 0 ? Math.max(...times) : null;
  const avgCompletionTimeSeconds = averageKdsItemCompletionSeconds(times);

  return {
    avgCompletionTimeSeconds,
    minCompletionTimeSeconds,
    maxCompletionTimeSeconds,
    totalQuantity: aggregate.totalQuantity,
  };
}

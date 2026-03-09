import type { TimeSeriesSeries } from '../components/charts/TimeSeriesLineChart';

/**
 * Returns the order of series IDs to use in the line chart tooltip (current vs comparison).
 * Returns undefined when no specific order is needed.
 */
export function getTooltipSeriesOrder(series: TimeSeriesSeries[]): string[] | undefined {
  if (series.length >= 2 && series.some((s) => s.id === 'current')) {
    return ['current', 'comparison'];
  }
  if (series.length >= 2) {
    const a = series[0];
    const b = series[1];
    return a != null && b != null ? [a.id, b.id] : undefined;
  }
  return undefined;
}

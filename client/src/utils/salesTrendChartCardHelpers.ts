import type { TimeSeriesSeries } from '../components/charts/TimeSeriesLineChart';

/** Pad tooltip label arrays to the x-axis length (sales trend current vs comparison). */
export function padTooltipLabelsToAxisLength(
  axisLength: number,
  labels: string[] | undefined | null,
): string[] {
  if (axisLength <= 0) return [];
  const src = labels ?? [];
  return Array.from({ length: axisLength }, (_, i) =>
    i < src.length ? (src[i] ?? '').trim() : '',
  );
}

/** Sum finite numeric points; null and non-finite values contribute 0. */
export function sumTimeSeriesDataPoints(data: (number | null)[] | undefined): number {
  if (data == null || data.length === 0) return 0;
  let total = 0;
  for (const v of data) {
    if (typeof v === 'number' && Number.isFinite(v)) total += v;
  }
  return total;
}

/**
 * Period-over-period percent change for legend (same rules as Command Center hourly net sales).
 * Both zero → 0%; comparison zero with any current → null; else ((current − comparison) / comparison) × 100.
 */
export function computePeriodOverPeriodPercentChange(
  currentTotal: number,
  comparisonTotal: number,
): number | null {
  if (comparisonTotal === 0 && currentTotal === 0) return 0;
  if (comparisonTotal === 0) return null;
  return ((currentTotal - comparisonTotal) / comparisonTotal) * 100;
}

export function formatPercentForLegend(percent: number | null): string {
  if (percent === null) return '—';
  return `${percent.toFixed(2)}%`;
}

/** Line-variant chart props: legend sums for current vs comparison (from SalesTrendReports chartProps). */
export type SalesTrendLineChartLegend =
  | { currentTotal: number }
  | {
      currentTotal: number;
      comparisonTotal: number;
      percentChange: number | null;
    };

export interface SalesTrendChartCardLegendNumericProps {
  currentPeriodTotal: number | undefined;
  comparisonPeriodTotal: number | undefined;
  periodPercentChange: number | null | undefined;
}

/**
 * Maps `chartProps.lineLegend` to SalesTrendChartCard numeric legend props (undefined when not line variant).
 */
export function salesTrendLineChartPropsToLegendTotals(
  chartProps: { variant: string; lineLegend?: SalesTrendLineChartLegend } | null,
): SalesTrendChartCardLegendNumericProps {
  if (chartProps?.variant !== 'line' || chartProps.lineLegend == null) {
    return {
      currentPeriodTotal: undefined,
      comparisonPeriodTotal: undefined,
      periodPercentChange: undefined,
    };
  }
  const lg = chartProps.lineLegend;
  if ('comparisonTotal' in lg) {
    return {
      currentPeriodTotal: lg.currentTotal,
      comparisonPeriodTotal: lg.comparisonTotal,
      periodPercentChange: lg.percentChange,
    };
  }
  return {
    currentPeriodTotal: lg.currentTotal,
    comparisonPeriodTotal: undefined,
    periodPercentChange: undefined,
  };
}

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

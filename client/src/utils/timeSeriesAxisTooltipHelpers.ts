/**
 * Second line under a series name in TimeSeriesLineChart axis tooltips (per-index date label).
 * Falls back to the axis header for the primary "current" series when the label array is empty at that index.
 */
export function axisTooltipRowDateSubline(
  dataIndex: number | null,
  perSeriesLabels: string[] | undefined,
  seriesId: string,
  axisHeader: string,
): string | null {
  if (dataIndex == null || perSeriesLabels == null) return null;
  const raw = (perSeriesLabels[dataIndex] ?? '').trim();
  if (raw !== '') return raw;
  if (seriesId === 'current') {
    const h = axisHeader.trim();
    return h !== '' ? h : null;
  }
  return '—';
}

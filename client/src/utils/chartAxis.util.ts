export function roundUpToStep(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0;
  const s = step > 0 ? step : 1;
  return Math.ceil(value / s) * s;
}

export function computePaddedMax(values: number[], params?: { min?: number; padMultiplier?: number; step?: number }): number {
  const min = params?.min ?? 0;
  const padMultiplier = params?.padMultiplier ?? 1.1;
  const step = params?.step ?? 10;
  const max = values.length > 0 ? Math.max(...values.filter((v) => Number.isFinite(v))) : 0;
  const padded = Math.max(min, max * padMultiplier);
  return roundUpToStep(padded, step);
}

/**
 * Build a chart axis value formatter that returns compact currency
 * (e.g. `$20K`, `$1.2M`) for tick labels and full precision for tooltips/
 * legend. MUI X Charts calls the formatter with `context.location === 'tick'`
 * for axis ticks, `'tooltip'` for tooltips, etc. — when called without a
 * context (e.g. directly from legend code) the full formatter is used.
 *
 * Use this anywhere a chart y-axis displays USD amounts so labels never
 * collide with the chart area or clip to ellipsis ("$20,000.00" → "$20,0…").
 */
export function buildCurrencyAxisFormatter(
  options: { fractionDigits?: number; compactFractionDigits?: number } = {},
): (value: number, context?: { location?: string }) => string {
  const fullFmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: options.fractionDigits ?? 2,
    maximumFractionDigits: options.fractionDigits ?? 2,
  });
  const compactFmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: options.compactFractionDigits ?? 1,
  });
  return (value, context) =>
    context?.location === 'tick' ? compactFmt.format(value) : fullFmt.format(value);
}


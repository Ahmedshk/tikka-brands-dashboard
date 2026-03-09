import { TREND_POSITIVE, TREND_NEGATIVE } from '../constants/trendColors';

export const COMPARISON_BAR_COLOR = '#9CA3AF';

export function getTrendColor(currentValue: number, comparisonValue: number): string {
  if (comparisonValue === 0) return TREND_POSITIVE;
  return currentValue >= comparisonValue ? TREND_POSITIVE : TREND_NEGATIVE;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Returns null when comparison is 0 and current > 0 (undefined % change); otherwise the percentage. */
export function getPercentChange(currentValue: number, comparisonValue: number): number | null {
  if (comparisonValue === 0) return currentValue > 0 ? null : 0;
  return ((currentValue - comparisonValue) / comparisonValue) * 100;
}

export function formatPercentDisplay(percent: number | null): string {
  if (percent === null) return 'N/A';
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

/** For visual view only: show nothing when undefined (no N/A or —). */
export function formatPercentDisplayVisual(percent: number | null): string {
  if (percent === null) return '';
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

export function getPercentChangeClassName(percent: number | null): string {
  if (percent === null) return 'text-secondary';
  return percent >= 0 ? 'text-positive' : 'text-negative';
}

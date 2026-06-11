import type { ReviewRatingKPIPeriod } from '../components/CommandCenter/CommandCenterKPICards';

export function reviewRatingPeriodLabel(period: ReviewRatingKPIPeriod): string {
  switch (period) {
    case 'today':
      return 'Today';
    case 'weekToDate':
      return 'Week to date';
    case 'overall':
      return 'Overall';
    default: {
      const _exhaustive: never = period;
      return _exhaustive;
    }
  }
}

export function reviewRatingSubtitle(rating: number | null | undefined): string {
  if (rating == null) return '—';
  if (rating >= 4.5) return 'Excellent';
  if (rating >= 4) return 'Good';
  if (rating >= 3) return 'Fair';
  return 'Needs attention';
}

export function formatStarRating(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toFixed(1);
}

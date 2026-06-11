import { format, parse } from 'date-fns';
import type { ReactNode } from 'react';
import type { KPICardAccentColor } from '../components/common/KPICard';
import type { RatingsReviewsPeriodValue } from './ratingsAndReviewsPeriodRange';
import { formatStarRating, reviewRatingSubtitle } from './reviewRatingDisplayHelpers';

export interface RatingsAndReviewsKPIItem {
  title: string;
  timePeriod?: string;
  value: string;
  accentColor: KPICardAccentColor;
  rightIcon?: ReactNode;
  subtitle?: string;
  subtitleIcon?: ReactNode;
  loading?: boolean;
}

function isoYmdToDisplay(ymd: string): string {
  try {
    return format(parse(ymd, 'yyyy-MM-dd', new Date()), 'MM/dd/yy');
  } catch {
    return ymd;
  }
}

export function ratingsAndReviewsPeriodLabel(value: RatingsReviewsPeriodValue): string {
  switch (value.periodType) {
    case 'all':
      return 'All time';
    case 'today':
      return 'Today';
    case 'weekToDate':
      return 'Week to date';
    case 'month':
      return 'This month';
    case 'custom': {
      const start = value.periodStart?.trim();
      const end = value.periodEnd?.trim();
      if (start && end) {
        return `${isoYmdToDisplay(start)} – ${isoYmdToDisplay(end)}`;
      }
      return 'Custom';
    }
    default: {
      const _exhaustive: never = value.periodType;
      return _exhaustive;
    }
  }
}

function formatReviewCount(count: number): string {
  return count.toLocaleString('en-US');
}

export interface BuildRatingsAndReviewsKPIItemsParams {
  summary: { averageRating: number | null; reviewCount: number };
  periodValue: RatingsReviewsPeriodValue;
  loading: boolean;
  starSubtitleIcon: ReactNode;
  reviewCountIcon: ReactNode;
}

export function buildRatingsAndReviewsKPIItems({
  summary,
  periodValue,
  loading,
  starSubtitleIcon,
  reviewCountIcon,
}: BuildRatingsAndReviewsKPIItemsParams): RatingsAndReviewsKPIItem[] {
  const timePeriod = loading ? undefined : ratingsAndReviewsPeriodLabel(periodValue);

  return [
    {
      title: 'Average Rating',
      timePeriod,
      value: formatStarRating(summary.averageRating),
      accentColor: 'gold',
      subtitle: loading ? undefined : reviewRatingSubtitle(summary.averageRating),
      subtitleIcon: starSubtitleIcon,
      loading,
    },
    {
      title: 'Review Count',
      timePeriod,
      value: loading ? '—' : formatReviewCount(summary.reviewCount),
      accentColor: 'azure',
      rightIcon: reviewCountIcon,
      loading,
    },
  ];
}

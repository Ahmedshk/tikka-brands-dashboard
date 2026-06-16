/** Star icon beside the rating label (e.g. "Good") — matches Command Center Review Rating KPI. */
export const REVIEW_RATING_KPI_SUBTITLE_STAR_CLASS =
  'w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-quaternary';

export function formatOverallRatingFooter(
  overall: number | null | undefined,
  count: number | null | undefined,
): string {
  if (overall == null) return 'Overall: —';
  const countStr = count != null ? ` (${count} reviews)` : '';
  return `Overall: ${overall.toFixed(1)}${countStr}`;
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

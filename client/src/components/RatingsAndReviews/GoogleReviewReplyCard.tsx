import { formatReviewDate } from '../../utils/ratingsAndReviewsHelpers';

export interface GoogleReviewReplyCardProps {
  comment: string;
  updateTime: string;
  displayTimezone: string;
  locationName?: string;
}

export function GoogleReviewReplyCard({
  comment,
  updateTime,
  displayTimezone,
  locationName,
}: Readonly<GoogleReviewReplyCardProps>) {
  const replyLabel = locationName ? `Reply from ${locationName}` : 'Business reply';

  return (
    <div className="mt-3 rounded-lg border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-3 py-3 md:px-4 md:py-3.5 shadow-sm">
      <div className="flex items-start gap-2.5">
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"
          aria-hidden
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 10h10a4 4 0 0 1 4 4v1M3 10l4-4m-4 4 4 4"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xs font-semibold text-emerald-900">{replyLabel}</span>
            <span className="text-xs text-tertiary">{formatReviewDate(updateTime, displayTimezone)}</span>
          </div>
          <p className="mt-1.5 text-sm text-secondary whitespace-pre-wrap leading-relaxed">{comment}</p>
        </div>
      </div>
    </div>
  );
}

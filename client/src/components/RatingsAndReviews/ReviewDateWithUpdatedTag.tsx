import { formatReviewDate, reviewWasUpdated } from '../../utils/ratingsAndReviewsHelpers';

export interface ReviewDateWithUpdatedTagProps {
  createTime: string;
  updateTime: string;
  displayTimezone: string;
}

export function ReviewDateWithUpdatedTag({
  createTime,
  updateTime,
  displayTimezone,
}: Readonly<ReviewDateWithUpdatedTagProps>) {
  const showUpdated = reviewWasUpdated(createTime, updateTime);

  return (
    <p className="text-xs text-tertiary mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span>{formatReviewDate(createTime, displayTimezone)}</span>
      {showUpdated ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] md:text-xs font-medium text-amber-800 ring-1 ring-amber-200/90">
          <span>Updated</span>
          <span className="font-normal text-amber-700/90">
            {formatReviewDate(updateTime, displayTimezone)}
          </span>
        </span>
      ) : null}
    </p>
  );
}

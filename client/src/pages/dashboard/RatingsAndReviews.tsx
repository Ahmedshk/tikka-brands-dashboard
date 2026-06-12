import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import OperationsIcon from '@assets/icons/operations.svg?react';
import ReviewsDueIcon from '@assets/icons/review_count.svg?react';
import StarIcon from '@assets/icons/star.svg?react';
import { Layout } from '../../components/common/Layout';
import { Spinner } from '../../components/common/Spinner';
import { Pagination } from '../../components/common/Pagination';
import {
  GoogleReviewReplyCard,
  RatingsAndReviewsKPICards,
  RatingsAndReviewsPeriodPicker,
  RatingsReviewRatingRangeFilter,
  ReviewDateWithUpdatedTag,
  ReviewLocationPill,
  ReviewerAvatar,
} from '../../components/RatingsAndReviews';
import type { RootState } from '../../store/store';
import { ALL_LOCATIONS_ID } from '../../store/slices/location.slice';
import {
  googleBusinessReviewService,
  type GoogleBusinessReviewRow,
} from '../../services/googleBusinessReview.service';
import {
  customPeriodToIsoRange,
  DEFAULT_RATINGS_PERIOD,
  type RatingsReviewsPeriodValue,
} from '../../utils/ratingsAndReviewsPeriodRange';
import { resolveDisplayTimezone } from '../../utils/displayTimezoneHelpers';
import { renderStars } from '../../utils/ratingsAndReviewsHelpers';
import { resolveRatingsReviewRatingBounds } from '../../utils/ratingsReviewFilterHelpers';
import { buildRatingsAndReviewsKPIItems } from '../../utils/ratingsAndReviewsKpiHelpers';
import { REVIEW_RATING_KPI_SUBTITLE_STAR_CLASS } from '../../utils/reviewRatingDisplayHelpers';

const PAGE_SIZE = 10;

export const RatingsAndReviews = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const allLocationsSelected = useSelector((state: RootState) => state.location.allLocationsSelected);
  const locationId = allLocationsSelected ? ALL_LOCATIONS_ID : (currentLocation?._id ?? '');

  const displayTimezone = useMemo(
    () => resolveDisplayTimezone(allLocationsSelected, currentLocation?.timezone),
    [allLocationsSelected, currentLocation?.timezone],
  );

  const [periodValue, setPeriodValue] = useState<RatingsReviewsPeriodValue>(DEFAULT_RATINGS_PERIOD);
  const [appliedMinRating, setAppliedMinRating] = useState('');
  const [appliedMaxRating, setAppliedMaxRating] = useState('');
  const [page, setPage] = useState(1);
  const [prevFilterKey, setPrevFilterKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<GoogleBusinessReviewRow[]>([]);
  const [summary, setSummary] = useState<{ averageRating: number | null; reviewCount: number }>({
    averageRating: null,
    reviewCount: 0,
  });
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  const customIsoRange = useMemo(() => {
    if (periodValue.periodType !== 'custom') return null;
    if (!periodValue.periodStart || !periodValue.periodEnd) return null;
    return customPeriodToIsoRange(periodValue.periodStart, periodValue.periodEnd, displayTimezone);
  }, [periodValue, displayTimezone]);

  const ratingBounds = useMemo(
    () => resolveRatingsReviewRatingBounds(appliedMinRating, appliedMaxRating).bounds,
    [appliedMinRating, appliedMaxRating],
  );

  const filterKey = useMemo(
    () =>
      [
        locationId,
        periodValue.periodType,
        periodValue.periodStart ?? '',
        periodValue.periodEnd ?? '',
        appliedMinRating,
        appliedMaxRating,
      ].join('|'),
    [
      locationId,
      periodValue.periodType,
      periodValue.periodStart,
      periodValue.periodEnd,
      appliedMinRating,
      appliedMaxRating,
    ],
  );

  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  useEffect(() => {
    if (!locationId) {
      setReviews([]);
      setLoading(false);
      return;
    }
    if (periodValue.periodType === 'custom' && !customIsoRange) {
      setLoading(false);
      return;
    }
    const query: Parameters<typeof googleBusinessReviewService.list>[0] = {
      locationId,
      period: periodValue.periodType,
      page,
      limit: PAGE_SIZE,
    };
    if (customIsoRange) {
      query.startDate = customIsoRange.startDate;
      query.endDate = customIsoRange.endDate;
    }
    if (ratingBounds.minRating != null) query.minRating = ratingBounds.minRating;
    if (ratingBounds.maxRating != null) query.maxRating = ratingBounds.maxRating;

    let cancelled = false;
    setLoading(true);

    void googleBusinessReviewService
      .list(query)
      .then((data) => {
        if (cancelled) return;
        setReviews(data.reviews);
        setSummary(data.summary);
        setTotalPages(data.pagination.totalPages);
        setTotalItems(data.pagination.total);
      })
      .catch(() => {
        if (cancelled) return;
        setReviews([]);
        setSummary({ averageRating: null, reviewCount: 0 });
        setTotalPages(0);
        setTotalItems(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    locationId,
    periodValue.periodType,
    periodValue.periodStart,
    periodValue.periodEnd,
    page,
    customIsoRange,
    ratingBounds.minRating,
    ratingBounds.maxRating,
  ]);

  const handlePeriodChange = (next: RatingsReviewsPeriodValue) => {
    setPeriodValue(next);
  };

  const ratingsKPIs = useMemo(
    () =>
      buildRatingsAndReviewsKPIItems({
        summary,
        periodValue,
        loading,
        starSubtitleIcon: (
          <StarIcon className={REVIEW_RATING_KPI_SUBTITLE_STAR_CLASS} aria-hidden />
        ),
        reviewCountIcon: (
          <ReviewsDueIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" aria-hidden />
        ),
      }),
    [summary, periodValue, loading],
  );

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <OperationsIcon
              className="h-4 w-4 text-primary md:h-5 md:w-5 2xl:h-6 2xl:w-6"
              aria-hidden
            />
            Ratings & Reviews
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <RatingsReviewRatingRangeFilter
              appliedMin={appliedMinRating}
              appliedMax={appliedMaxRating}
              onApply={(min, max) => {
                setAppliedMinRating(min);
                setAppliedMaxRating(max);
              }}
              onClear={() => {
                setAppliedMinRating('');
                setAppliedMaxRating('');
              }}
            />
            <RatingsAndReviewsPeriodPicker
              value={periodValue}
              onChange={handlePeriodChange}
              timezone={displayTimezone}
              className="min-w-[10rem]"
            />
          </div>
        </div>

        {locationId ? <RatingsAndReviewsKPICards items={ratingsKPIs} /> : null}

        <div className="bg-card-background rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-tertiary p-6">No reviews found for the selected filters.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {reviews.map((r) => (
                <li key={r._id} className="p-4 md:p-5">
                  {allLocationsSelected && r.locationName ? (
                    <ReviewLocationPill name={r.locationName} />
                  ) : null}
                  <div className="flex gap-4">
                    <ReviewerAvatar
                      displayName={r.reviewer.displayName}
                      profilePhotoUrl={r.reviewer.profilePhotoUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-primary">{r.reviewer.displayName}</span>
                        <span
                          className="text-amber-500 text-lg md:text-xl leading-none"
                          aria-label={`${r.starRatingNumeric} stars`}
                        >
                          {renderStars(r.starRatingNumeric)}
                        </span>
                      </div>
                      <ReviewDateWithUpdatedTag
                        createTime={r.createTime}
                        updateTime={r.updateTime}
                        displayTimezone={displayTimezone}
                      />
                      {r.comment && (
                        <p className="text-sm text-secondary mt-2 whitespace-pre-wrap leading-relaxed">
                          {r.comment}
                        </p>
                      )}
                      {r.reviewReply?.comment && (
                        <GoogleReviewReplyCard
                          comment={r.reviewReply.comment}
                          updateTime={r.reviewReply.updateTime}
                          displayTimezone={displayTimezone}
                          locationName={r.locationName}
                        />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-4">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </Layout>
  );
};

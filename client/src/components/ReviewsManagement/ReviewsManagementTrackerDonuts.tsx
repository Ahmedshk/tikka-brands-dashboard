import type { ReviewTrackerDonut } from "../TrainingReviews";
import { ReviewTrackerCard } from "../TrainingReviews";

export const ReviewsManagementTrackerDonuts = ({
  donuts,
  loading,
}: {
  donuts: ReviewTrackerDonut[];
  loading: boolean;
}) => {
  if (donuts.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6 items-stretch">
      {donuts.map((donut) => (
        <div key={donut.id} className="min-h-0 flex flex-col">
          <ReviewTrackerCard donut={donut} loading={loading} />
        </div>
      ))}
    </div>
  );
};


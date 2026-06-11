import { KPICard } from '../common/KPICard';
import type { RatingsAndReviewsKPIItem } from '../../utils/ratingsAndReviewsKpiHelpers';

export interface RatingsAndReviewsKPICardsProps {
  items: RatingsAndReviewsKPIItem[];
}

export const RatingsAndReviewsKPICards = ({ items }: RatingsAndReviewsKPICardsProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 overflow-visible">
      {items.map((kpi) => (
        <KPICard key={kpi.title} {...kpi} />
      ))}
    </div>
  );
};

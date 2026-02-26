import type { RecentlyCompletedReviewItem } from '../../types/trainingReviews.types';
import ViewIcon from '@assets/icons/view.svg?react';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

export interface RecentlyCompletedReviewsCardProps {
  items: RecentlyCompletedReviewItem[];
  onView?: (item: RecentlyCompletedReviewItem, index: number) => void;
  onViewAll?: () => void;
  viewAllHref?: string;
}

export const RecentlyCompletedReviewsCard = ({
  items,
  onView,
  onViewAll,
  viewAllHref,
}: RecentlyCompletedReviewsCardProps) => {
  return (
    <div className={`${cardClass} flex flex-col h-full min-h-0`}>
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center flex-shrink-0">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
          Recently Completed Reviews
        </h3>
      </div>
      <div className="p-5 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
          <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
            <thead>
              <tr className="text-left text-secondary border-b border-gray-200">
                <th className="pb-3 pr-4 pl-2 font-semibold">Name</th>
                <th className="pb-3 pr-4 font-semibold text-center">Review Type</th>
                <th className="pb-3 pr-4 font-semibold text-center">Completed on</th>
                <th className="pb-3 pr-2 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="text-primary">
              {items.map((item, index) => (
                <tr
                  key={`${item.name}-${item.reviewType}-${index}`}
                  className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                >
                  <td className="py-3 pr-4 pl-2">{item.name}</td>
                  <td className="py-3 pr-4 text-center">{item.reviewType}</td>
                  <td className="py-3 pr-4 text-primary text-center">
                    {item.completedDate}
                  </td>
                  <td className="py-3 pr-2 text-center">
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => onView?.(item, index)}
                        className="p-1 text-primary hover:bg-gray-200 rounded transition-colors"
                        aria-label="View"
                        title="View"
                      >
                        <ViewIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end flex-shrink-0">
          {viewAllHref == null ? (
            <button
              type="button"
              onClick={onViewAll}
              className="text-sm font-medium text-quaternary hover:underline bg-transparent border-0 cursor-pointer p-0"
              title="View all"
            >
              View All
            </button>
          ) : (
            <a
              href={viewAllHref}
              className="text-sm font-medium text-quaternary hover:underline"
            >
              View All
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

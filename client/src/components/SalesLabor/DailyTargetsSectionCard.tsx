import { DailyTargetsCard } from './DailyTargetsCard';
import type { TargetActualItem } from './DailyTargetsCard';
import { Spinner } from '../common/Spinner';

export interface DailyTargetsSectionCardProps {
  items: TargetActualItem[];
  /** Optional className for the card wrapper (e.g. for grid sizing) */
  className?: string;
  /** When true, show a centered spinner in the card instead of the content */
  loading?: boolean;
  /** Optional label suffix (e.g. "(Avg goal)") */
  titleSuffix?: string;
}

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden flex flex-col min-h-0';

export const DailyTargetsSectionCard = ({ items, className = '', loading = false, titleSuffix }: DailyTargetsSectionCardProps) => {
  return (
    <div className={`${cardClass} ${className}`}>
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center justify-center md:justify-start flex-wrap gap-2 flex-shrink-0">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
          Daily Targets vs Actual{titleSuffix ? ` ${titleSuffix}` : ''}
        </h3>
      </div>
      <div className="p-5 flex flex-col flex-1 min-h-[200px]">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size="lg" className="text-button-primary" />
          </div>
        ) : (
          <DailyTargetsCard items={items} />
        )}
      </div>
    </div>
  );
};

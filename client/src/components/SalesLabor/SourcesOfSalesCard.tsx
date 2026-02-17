import { SourcesOfSalesChart } from '../charts/SourcesOfSalesChart';
import type { SourcesOfSalesSegment } from '../charts/SourcesOfSalesChart';

export interface SourcesOfSalesCardProps {
  totalSales: string;
  segments: SourcesOfSalesSegment[];
  /** Optional subtitle in the title (e.g. "Today") */
  subtitle?: string;
  /** Optional className for the card wrapper */
  className?: string;
}

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

export const SourcesOfSalesCard = ({
  totalSales,
  segments,
  subtitle,
  className = '',
}: SourcesOfSalesCardProps) => {
  return (
    <div className={`${cardClass} ${className}`}>
      <div className="p-5 pb-0 flex items-center justify-center">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-secondary text-center">
          Sources of Sales
          {subtitle != null && (
            <span className="font-medium text-primary text-[10px] md:text-xs 2xl:text-sm"> ({subtitle})</span>
          )}
        </h3>
      </div>
      <div className="px-5 pb-5">
        <SourcesOfSalesChart totalSales={totalSales} segments={segments} />
      </div>
    </div>
  );
};

import { HourlyBreakdownChart } from '../charts/HourlyBreakdownChart';

export interface HourlyBreakdownCardProps {
  xAxisLabels: string[];
  salesData: number[];
  laborCostData: number[];
  height?: number;
  /** Optional className for the card wrapper (e.g. for grid sizing) */
  className?: string;
}

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

export const HourlyBreakdownCard = ({
  xAxisLabels,
  salesData,
  laborCostData,
  height = 280,
  className = '',
}: HourlyBreakdownCardProps) => {
  return (
    <div className={`${cardClass} ${className}`}>
      <div className="p-5 pb-4 flex items-center flex-wrap gap-2">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-secondary">Hourly Breakdown</h3>
      </div>
      <div className="px-5 pb-2 flex items-center gap-4">
        <span className="flex items-center gap-2 text-xs text-primary">
          <span className="w-3 h-3 rounded-full bg-quaternary" aria-hidden />
          Net Sales Per hours
        </span>
        <span className="flex items-center gap-2 text-xs text-primary">
          <span className="w-3 h-3 rounded-full bg-red-500" aria-hidden />
          Labor Cost % Per hours
        </span>
      </div>
      <div className="scrollbar-touch -mx-3 px-3 pb-3 md:mx-0 md:px-5 md:pb-5 overflow-x-auto md:overflow-visible">
        <div className="min-w-[560px] md:min-w-0 w-full">
          <HourlyBreakdownChart
            xAxisLabels={xAxisLabels}
            salesData={salesData}
            laborCostData={laborCostData}
            height={height}
          />
        </div>
      </div>
    </div>
  );
};

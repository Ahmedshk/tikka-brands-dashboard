import {
  TimeSeriesLineChart,
  type TimeSeriesSeries,
  type TimeSeriesLineChartYAxisOverrides,
} from '../charts/TimeSeriesLineChart';
import { Spinner } from '../common/Spinner';

export interface HourlySalesChartCardProps {
  xAxisData: (string | number)[];
  series: TimeSeriesSeries[];
  height?: number;
  /** Optional className for the card wrapper (e.g. for grid sizing) */
  className?: string;
  /** Y-axis options (e.g. valueFormatter for currency) */
  yAxis?: TimeSeriesLineChartYAxisOverrides;
  loading?: boolean;
  error?: string | null;
}

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

const TODAY_COLOR = '#FDB90E';
const LAST_WEEK_COLOR = '#9ca3af';

export const HourlySalesChartCard = ({
  xAxisData,
  series,
  height = 256,
  className = '',
  yAxis,
  loading = false,
  error = null,
}: HourlySalesChartCardProps) => {
  const colors = [TODAY_COLOR, LAST_WEEK_COLOR];

  return (
    <div className={`${cardClass} ${className}`}>
      <div className="p-5 pb-4 flex items-center flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-secondary">Hourly Net Sales: Today vs. Last Week</h3>
      </div>
      <div className="px-5 pb-2 flex items-center gap-4">
        <span className="flex items-center gap-2 text-xs text-primary">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: TODAY_COLOR }} aria-hidden />
          {' '}
          Today
        </span>
        <span className="flex items-center gap-2 text-xs text-primary">
          <span className="rounded-full border-2 border-dashed bg-transparent box-content shrink-0" style={{ width: 10, height: 10, borderColor: LAST_WEEK_COLOR }} aria-hidden />
          {' '}
          Last Week
        </span>
      </div>
      <div className="h-64 -mx-3 px-3 pb-3 md:mx-0 md:px-5 md:pb-5 relative">
        {error && (
          <p className="text-sm text-negative absolute top-2 left-4 right-4" role="alert">{error}</p>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-full min-h-[200px]">
            <Spinner size="lg" className="text-button-primary" />
          </div>
        ) : (
          <div className="hourly-sales-chart w-full">
            <TimeSeriesLineChart
              xAxisData={xAxisData}
              series={series}
              height={height}
              colors={colors}
              yAxis={yAxis}
            />
          </div>
        )}
      </div>
    </div>
  );
};

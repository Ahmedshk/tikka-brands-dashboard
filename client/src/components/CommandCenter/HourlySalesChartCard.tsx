import {
  TimeSeriesLineChart,
  type TimeSeriesSeries,
  type TimeSeriesLineChartYAxisOverrides,
} from '../charts/TimeSeriesLineChart';
import { Spinner } from '../common/Spinner';
import IncreaseUpIcon from '@assets/icons/increase_up.svg?react';
import DecreaseDownIcon from '@assets/icons/decrease_down.svg?react';

export interface HourlySalesChartCardProps {
  xAxisData: (string | number)[];
  series: TimeSeriesSeries[];
  /** Total net sales for today (sum of hourly values) */
  todayTotal: number;
  /** Total net sales for last week (sum of hourly values) */
  lastWeekTotal: number;
  /** Percent change (today vs last week); null when last week is 0 or undefined */
  percentChange: number | null;
  /** Formatter for currency (e.g. totals in legend) */
  valueFormatter: (v: number) => string;
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

function formatPercentDisplay(percent: number | null): string {
  if (percent === null) return '—';
  return `${percent.toFixed(2)}%`;
}

export const HourlySalesChartCard = ({
  xAxisData,
  series,
  todayTotal,
  lastWeekTotal,
  percentChange,
  valueFormatter,
  height = 256,
  className = '',
  yAxis,
  loading = false,
  error = null,
}: HourlySalesChartCardProps) => {
  const colors = [LAST_WEEK_COLOR, TODAY_COLOR];
  const hasIncrease = percentChange !== null && percentChange >= 0;
  const hasDecrease = percentChange !== null && percentChange < 0;

  let percentBadgeClass = 'bg-gray-100 text-secondary';
  if (hasIncrease) percentBadgeClass = 'bg-positive/10 text-positive';
  else if (hasDecrease) percentBadgeClass = 'bg-negative/10 text-negative';

  return (
    <div className={`${cardClass} ${className}`}>
      <div className="p-5 pb-4 flex items-center justify-center flex-wrap gap-2 min-[500px]:justify-start">
        <h3 className="text-sm font-semibold text-secondary">Hourly Net Sales: Today vs. Last Week</h3>
      </div>
      <div className="px-5 pb-2 flex flex-col gap-2 items-center min-[500px]:flex-row min-[500px]:items-center min-[500px]:flex-wrap min-[500px]:gap-4 relative">
        <span className="flex items-center justify-center gap-4 flex-wrap min-[500px]:justify-start">
          <span className="flex items-center gap-2 text-xs text-primary">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: TODAY_COLOR }} aria-hidden />
            {' '}
            Today
            <span className="font-medium tabular-nums">{valueFormatter(todayTotal)}</span>
          </span>
          <span className="flex items-center gap-2 text-xs text-primary">
            <span className="rounded-full border-2 border-dashed bg-transparent box-content shrink-0" style={{ width: 10, height: 10, borderColor: LAST_WEEK_COLOR }} aria-hidden />
            {' '}
            Last Week
            <span className="font-medium tabular-nums">{valueFormatter(lastWeekTotal)}</span>
          </span>
        </span>
        <span className="flex justify-center min-[500px]:absolute min-[500px]:top-1/2 min-[500px]:right-5 min-[500px]:left-auto min-[500px]:-translate-y-1/2 min-[1367px]:left-1/2 min-[1367px]:right-auto min-[1367px]:-translate-x-1/2">
          {percentChange === null ? (
            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-secondary tabular-nums">
              —
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold tabular-nums ${percentBadgeClass}`}
            >
              {hasIncrease && <IncreaseUpIcon className="w-3 h-3 shrink-0 [&_path]:fill-current" aria-hidden />}
              {hasDecrease && <DecreaseDownIcon className="w-3 h-3 shrink-0 [&_path]:fill-current" aria-hidden />}
              {formatPercentDisplay(percentChange)}
            </span>
          )}
        </span>
      </div>
      <div className="scrollbar-touch min-h-[280px] h-72 md:h-64 -mx-3 px-3 pb-3 md:mx-0 md:px-5 md:pb-5 relative overflow-x-auto md:overflow-visible overflow-y-hidden">
        {error && (
          <p className="text-sm text-negative absolute top-2 left-4 right-4" role="alert">{error}</p>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-full min-h-[200px]">
            <Spinner size="lg" className="text-button-primary" />
          </div>
        ) : (
          <div className="hourly-sales-chart min-w-[560px] md:min-w-0 w-full">
            <TimeSeriesLineChart
              xAxisData={xAxisData}
              series={series}
              height={height}
              colors={colors}
              yAxis={yAxis}
              tooltipSeriesOrder={['today', 'lastWeek']}
            />
          </div>
        )}
      </div>
    </div>
  );
};

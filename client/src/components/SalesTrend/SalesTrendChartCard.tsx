import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { TimeSeriesLineChart } from '../charts/TimeSeriesLineChart';
import type { TimeSeriesSeries, TimeSeriesLineChartYAxisOverrides } from '../charts/TimeSeriesLineChart';
import { Spinner } from '../common/Spinner';
import { Dropdown } from '../common/Dropdown';
import { getTooltipSeriesOrder } from '../../utils/salesTrendChartCardHelpers';
import { SalesTrendStackedChart } from './SalesTrendStackedChart';

export interface SalesTrendChartCardProps {
  xAxisData: (string | number)[];
  series: TimeSeriesSeries[];
  /** 'line' = current vs comparison (2 series); 'stackedArea' = by source (multiple series) */
  variant: 'line' | 'stackedArea';
  /** Chart card title (e.g. "Net Sales Trend", "Transactions Trend") */
  title?: string;
  /** Show Group by dropdown (only when metric is Net Sales) */
  showGroupBy?: boolean;
  groupBy: string;
  onGroupByChange: (value: string) => void;
  yAxis?: TimeSeriesLineChartYAxisOverrides;
  height?: number;
  className?: string;
  /** When true, show spinner inside the card instead of the chart */
  loading?: boolean;
  /** Formatted date range for current period (e.g. "02/22/26 – 02/27/26"); shown with legend */
  periodDateRange?: string;
  /** Formatted date range for comparison period; shown with legend when present */
  comparisonDateRange?: string;
}

const desktopMargin = { top: 10, right: 25, bottom: 0, left: 0 };
const mobileMargin = { top: 4, right: 14, bottom: 0, left: 0 };

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden min-w-0';

export const SalesTrendChartCard = ({
  xAxisData,
  series,
  variant,
  title = 'Sales Trend',
  showGroupBy = false,
  groupBy,
  onGroupByChange,
  yAxis,
  height = 280,
  className = '',
  loading = false,
  periodDateRange,
  comparisonDateRange,
}: SalesTrendChartCardProps) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const margin = isDesktop ? desktopMargin : mobileMargin;

  const isStacked = variant === 'stackedArea';
  const chartSeries = series.map((s) => ({
    id: s.id,
    data: s.data as number[],
    label: s.label,
    color: s.color,
    ...(isStacked
      ? { area: true, stack: 'total' as const, showMark: false }
      : {}),
  }));

  function renderChartContent() {
    if (loading) {
      return (
        <div className="flex justify-center items-center w-full" style={{ minHeight: height }}>
          <Spinner size="lg" className="text-button-primary" />
        </div>
      );
    }
    if (series.length === 0) {
      return (
        <div className="flex justify-center items-center w-full text-secondary text-sm" style={{ minHeight: height }}>
          No trend data available.
        </div>
      );
    }
    if (isStacked) {
      return (
        <SalesTrendStackedChart
          xAxisData={xAxisData}
          chartSeries={chartSeries}
          height={height}
          margin={margin}
          yAxis={yAxis}
          isDesktop={isDesktop}
        />
      );
    }
    return (
      <TimeSeriesLineChart
        xAxisData={xAxisData}
        series={series}
        height={height}
        yAxis={yAxis}
        tooltipSeriesOrder={getTooltipSeriesOrder(series)}
      />
    );
  }

  return (
    <div className={`${cardClass} mb-6 ${className}`}>
      <div className="p-5 pb-4 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-secondary">{title}</h3>
        {showGroupBy && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-secondary">Group by:</span>
            <Dropdown
              options={[
                { value: 'none', label: 'None' },
                { value: 'source', label: 'Source' },
              ]}
              value={groupBy}
              onChange={onGroupByChange}
              placeholder="None"
              aria-label="Group by"
              className="min-w-0"
              allowEmpty={false}
            />
          </div>
        )}
      </div>
      {!loading && !isStacked && series.length >= 1 && (() => {
        const current = series.find((s) => s.id === 'current') ?? series[0];
        const comparisonSeries = series.find((s) => s.id === 'comparison') ?? series[1];
        return (
          <div className="px-5 pb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-2 text-xs text-primary">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: current?.color ?? '#FBC52A' }}
                aria-hidden
              />
              <span>
                {current?.label ?? 'This period'}
                {(periodDateRange != null && periodDateRange !== '') && (
                  <span className="block text-[10px] text-gray-500 font-normal">{periodDateRange}</span>
                )}
              </span>
            </span>
            {series.length >= 2 && comparisonSeries && (
              <span className="flex items-center gap-2 text-xs text-primary">
                <span
                  className="rounded-full border-2 border-dashed bg-transparent box-content shrink-0"
                  style={{ width: 10, height: 10, borderColor: comparisonSeries?.color ?? '#9ca3af' }}
                  aria-hidden
                />
                <span>
                  {comparisonSeries?.label ?? 'Comparison'}
                  {comparisonDateRange && (
                    <span className="block text-[10px] text-gray-500 font-normal">{comparisonDateRange}</span>
                  )}
                </span>
              </span>
            )}
          </div>
        );
      })()}
      {!loading && isStacked && series.length > 0 && (
        <div className="px-5 pb-2 flex flex-wrap items-center gap-3">
          {series.map((s) => (
            <span key={s.id} className="flex items-center gap-2 text-xs text-primary">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: s.color ?? '#6D6D6D' }}
                aria-hidden
              />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div
        className="scrollbar-touch min-h-[200px] min-w-0 max-w-full -mx-3 px-3 pb-5 md:mx-0 md:px-5 overflow-x-auto md:overflow-visible overflow-y-hidden"
        style={loading || series.length === 0 ? { minHeight: height } : undefined}
      >
        <div className="min-w-[560px] md:min-w-0 w-full">
          {renderChartContent()}
        </div>
      </div>
    </div>
  );
};

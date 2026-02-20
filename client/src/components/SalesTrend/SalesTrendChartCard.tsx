import type { ComponentProps } from 'react';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { LineChart, lineElementClasses } from '@mui/x-charts/LineChart';
import { ChartsTooltipContainer, useAxesTooltip } from '@mui/x-charts/ChartsTooltip';
import { TimeSeriesLineChart } from '../charts/TimeSeriesLineChart';
import type { TimeSeriesSeries, TimeSeriesLineChartYAxisOverrides } from '../charts/TimeSeriesLineChart';
import { Spinner } from '../common/Spinner';

export interface SalesTrendChartCardProps {
  xAxisData: (string | number)[];
  series: TimeSeriesSeries[];
  /** 'line' = current vs comparison (2 series); 'stackedArea' = by source (multiple series) */
  variant: 'line' | 'stackedArea';
  /** Show Group by dropdown (only when metric is Net Sales) */
  showGroupBy?: boolean;
  groupBy: string;
  onGroupByChange: (value: string) => void;
  yAxis?: TimeSeriesLineChartYAxisOverrides;
  height?: number;
  className?: string;
  /** When true, show spinner inside the card instead of the chart */
  loading?: boolean;
}

const defaultTheme = createTheme({ palette: { mode: 'light' } });
const LABEL_FONT = { fontFamily: 'Onest, sans-serif', fill: '#5B6B79' };
const desktopMargin = { top: 10, right: 25, bottom: 0, left: 0 };
const mobileMargin = { top: 4, right: 14, bottom: 0, left: 0 };

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

function StackedTooltipContent({ valueFormatter }: { valueFormatter?: (v: number) => string }) {
  const axesTooltipData = useAxesTooltip();
  const firstAxis = axesTooltipData?.[0];
  if (!firstAxis || !axesTooltipData?.length) return null;
  const header = firstAxis.axisFormattedValue ?? String(firstAxis.axisValue ?? '—');
  const rows = firstAxis.seriesItems ?? [];
  const total = rows.reduce((sum, item) => {
    const n = typeof item.value === 'number' ? item.value : 0;
    return sum + n;
  }, 0);
  const fmt = valueFormatter ?? ((v: number) => v.toLocaleString());

  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm min-w-[160px]">
      <p className="text-sm font-semibold text-primary pb-2 mb-2 border-b border-gray-100">
        {header}
      </p>
      <div className="space-y-2">
        {rows.map((item) => (
          <div key={item.seriesId} className="flex items-center gap-2 w-full">
            <span
              className="shrink-0 rounded-sm"
              style={{ width: 12, height: 3, backgroundColor: item.color }}
              aria-hidden
            />
            <span className="text-xs text-secondary flex-1">
              {item.formattedLabel ?? item.seriesId}
            </span>
            <span className="text-xs font-medium text-primary tabular-nums">
              {fmt(typeof item.value === 'number' ? item.value : 0)}
            </span>
          </div>
        ))}
        {rows.length > 1 && (
          <div className="flex items-center gap-2 w-full pt-1 border-t border-gray-100">
            <span className="shrink-0" style={{ width: 12 }} aria-hidden />
            <span className="text-xs font-semibold text-primary flex-1">Total</span>
            <span className="text-xs font-semibold text-primary tabular-nums">{fmt(total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StackedTooltip(props: Readonly<ComponentProps<typeof ChartsTooltipContainer>> & { valueFormatter?: (v: number) => string }) {
  const { valueFormatter, ...rest } = props;
  return (
    <ChartsTooltipContainer {...rest} trigger="axis">
      <StackedTooltipContent valueFormatter={valueFormatter} />
    </ChartsTooltipContainer>
  );
}

export const SalesTrendChartCard = ({
  xAxisData,
  series,
  variant,
  showGroupBy = false,
  groupBy,
  onGroupByChange,
  yAxis,
  height = 280,
  className = '',
  loading = false,
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
      const maxLabels = isDesktop ? 20 : 12;
      const step = Math.max(1, Math.ceil(xAxisData.length / maxLabels));
      const tickLabelInterval = step > 1
        ? (_v: unknown, i: number) => i % step === 0
        : undefined;
      return (
        <ThemeProvider theme={defaultTheme}>
          <LineChart
            xAxis={[
              {
                scaleType: 'point',
                data: xAxisData,
                tickLabelStyle: isDesktop ? LABEL_FONT : { ...LABEL_FONT, fontSize: 9 },
                ...(tickLabelInterval && { tickLabelInterval }),
              },
            ]}
            yAxis={[
              {
                ...yAxis,
                tickLabelStyle: isDesktop ? LABEL_FONT : { ...LABEL_FONT, fontSize: 10 },
              },
            ]}
            series={chartSeries}
            height={height}
            margin={margin}
            grid={{ vertical: true, horizontal: true }}
            hideLegend
            slots={{ tooltip: StackedTooltip }}
            slotProps={{ tooltip: { trigger: 'axis', valueFormatter: yAxis?.valueFormatter } as never }}
            sx={{
              [`.${lineElementClasses.root}`]: { display: 'none' },
            }}
          />
        </ThemeProvider>
      );
    }
    let tooltipOrder: string[] | undefined;
    if (series.length >= 2 && series.some((s) => s.id === 'current')) {
      tooltipOrder = ['current', 'comparison'];
    } else if (series.length >= 2) {
      tooltipOrder = [series[0].id, series[1].id];
    } else {
      tooltipOrder = undefined;
    }
    return (
      <TimeSeriesLineChart
        xAxisData={xAxisData}
        series={series}
        height={height}
        yAxis={yAxis}
        tooltipSeriesOrder={tooltipOrder}
      />
    );
  }

  return (
    <div className={`${cardClass} mb-6 ${className}`}>
      <div className="p-5 pb-4 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-secondary">Sales Trend</h3>
        {showGroupBy && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-secondary">Group by:</span>
            <select
              value={groupBy}
              onChange={(e) => onGroupByChange(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs text-primary bg-white focus:outline-none focus:ring-2 focus:ring-quaternary/30"
            >
              <option value="none">None</option>
              <option value="source">Source</option>
            </select>
          </div>
        )}
      </div>
      {!loading && !isStacked && series.length >= 2 && (() => {
        const current = series.find((s) => s.id === 'current') ?? series[0];
        const comparisonSeries = series.find((s) => s.id === 'comparison') ?? series[1];
        return (
          <div className="px-5 pb-2 flex items-center gap-4">
            <span className="flex items-center gap-2 text-xs text-primary">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: current?.color ?? '#FBC52A' }}
                aria-hidden
              />
              {' '}
              {current?.label ?? 'This period'}
            </span>
            <span className="flex items-center gap-2 text-xs text-primary">
              <span
                className="rounded-full border-2 border-dashed bg-transparent box-content shrink-0"
                style={{ width: 10, height: 10, borderColor: comparisonSeries?.color ?? '#9ca3af' }}
                aria-hidden
              />
              {' '}
              {comparisonSeries?.label ?? 'Comparison'}
            </span>
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
        className="scrollbar-touch min-h-[200px] -mx-3 px-3 pb-5 md:mx-0 md:px-5 overflow-x-auto md:overflow-visible overflow-y-hidden"
        style={loading || series.length === 0 ? { minHeight: height } : undefined}
      >
        <div className="min-w-[560px] md:min-w-0 w-full">
          {renderChartContent()}
        </div>
      </div>
    </div>
  );
};

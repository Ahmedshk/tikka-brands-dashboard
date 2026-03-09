import type { ComponentProps } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { LineChart, lineElementClasses } from '@mui/x-charts/LineChart';
import { ChartsTooltipContainer, useAxesTooltip } from '@mui/x-charts/ChartsTooltip';
import type { TimeSeriesLineChartYAxisOverrides } from '../charts/TimeSeriesLineChart';

const defaultTheme = createTheme({ palette: { mode: 'light' } });
const LABEL_FONT = { fontFamily: 'Onest, sans-serif', fill: '#5B6B79' };

function StackedTooltipContent({ valueFormatter }: Readonly<{ valueFormatter?: (v: number) => string }>) {
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

export interface SalesTrendStackedChartProps {
  xAxisData: (string | number)[];
  chartSeries: Array<{ id: string; data: number[]; label: string; color?: string; area?: boolean; stack?: 'total'; showMark?: boolean }>;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  yAxis?: TimeSeriesLineChartYAxisOverrides;
  isDesktop: boolean;
}

export function SalesTrendStackedChart({
  xAxisData,
  chartSeries,
  height,
  margin,
  yAxis,
  isDesktop,
}: Readonly<SalesTrendStackedChartProps>) {
  const maxLabels = isDesktop ? 20 : 12;
  const step = Math.max(1, Math.ceil(xAxisData.length / maxLabels));
  const tickLabelInterval = step > 1 ? (_v: unknown, i: number) => i % step === 0 : undefined;
  const xAxisConfig = {
    scaleType: 'point' as const,
    data: xAxisData,
    tickLabelStyle: isDesktop ? LABEL_FONT : { ...LABEL_FONT, fontSize: 9 },
    ...(tickLabelInterval && { tickLabelInterval }),
  };
  const yAxisConfig = [
    {
      ...yAxis,
      width: isDesktop ? 88 : 76,
      tickLabelStyle: isDesktop
        ? { ...LABEL_FONT, overflow: 'visible' as const }
        : { ...LABEL_FONT, fontSize: 10, overflow: 'visible' as const },
    },
  ];

  return (
    <ThemeProvider theme={defaultTheme}>
      <LineChart
        xAxis={[xAxisConfig]}
        yAxis={yAxisConfig}
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

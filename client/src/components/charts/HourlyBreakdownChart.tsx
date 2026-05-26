import { createContext, useContext, useMemo, useRef, type ComponentProps } from 'react';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  ChartDataProvider,
  ChartsSurface,
  BarPlot,
  LinePlot,
  MarkPlot,
  ChartsXAxis,
  ChartsYAxis,
  ChartsGrid,
  ChartsAxisHighlight,
} from '@mui/x-charts';
import { useChartContainerProps } from '@mui/x-charts/internals';
import {
  ChartsTooltipContainer,
  useItemTooltip,
  useAxesTooltip,
} from '@mui/x-charts/ChartsTooltip';
import { buildCurrencyAxisFormatter, computePaddedMax } from '../../utils/chartAxis.util';

export interface HourlyBreakdownChartProps {
  xAxisLabels: string[];
  salesData: number[];
  laborCostData: number[];
  height?: number;
  /** Chart width in px. If omitted, chart uses container width (fits card on all screens). */
  width?: number;
}

const defaultTheme = createTheme({
  palette: { mode: 'light' },
});

const LABEL_FONT = { fontFamily: 'Onest, sans-serif', fill: '#5B6B79' };

const desktopMargin = { top: 50, right: 0, bottom: -20, left: 0 };
const mobileMargin = { top: 4, right: 15, bottom: 0, left: 10 };

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

interface HourlyBreakdownTooltipContextValue {
  labels: string[];
  sales: number[];
  labor: number[];
}

const HourlyBreakdownTooltipContext =
  createContext<HourlyBreakdownTooltipContextValue | null>(null);

function HourlyBreakdownTooltipContent() {
  const axesTooltipData = useAxesTooltip();
  const itemTooltipData = useItemTooltip();
  const ctx = useContext(HourlyBreakdownTooltipContext);
  const dataIndex =
    axesTooltipData?.[0]?.dataIndex ??
    itemTooltipData?.identifier?.dataIndex ??
    null;
  const hasData =
    (axesTooltipData != null && axesTooltipData.length > 0) || itemTooltipData != null;
  if (!ctx || dataIndex == null || dataIndex < 0 || !hasData) return null;
  const { labels, sales, labor } = ctx;
  const hour = labels[dataIndex] ?? '—';
  const salesVal = sales[dataIndex] ?? 0;
  const laborPct = labor[dataIndex] ?? 0;
  const laborAmount = salesVal > 0 ? (laborPct / 100) * salesVal : 0;
  const SALES_COLOR = '#FBC52A';
  const LABOR_COLOR = '#EF4444';
  const rows: { color: string; label: string; value: string }[] = [
    { color: SALES_COLOR, label: 'Net sales', value: formatCurrency(salesVal) },
    { color: LABOR_COLOR, label: 'Labor cost', value: formatCurrency(laborAmount) },
    { color: LABOR_COLOR, label: 'Labor cost %', value: `${laborPct.toFixed(2)}%` },
  ];
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm min-w-[160px]">
      <p className="text-sm font-semibold text-primary pb-2 mb-2 border-b border-gray-100">
        {hour}
      </p>
      <div className="space-y-2">
        {rows.map(({ color, label, value }) => (
          <div
            key={label}
            className="flex items-center gap-2 w-full"
          >
            <span
              className="shrink-0 rounded-sm"
              style={{ width: 12, height: 3, backgroundColor: color }}
              aria-hidden
            />
            <span className="text-xs text-secondary flex-1">{label}</span>
            <span className="text-xs font-medium text-primary tabular-nums">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HourlyBreakdownTooltipWithContainer(
  props: Readonly<ComponentProps<typeof ChartsTooltipContainer>>
) {
  return (
    <ChartsTooltipContainer {...props} trigger="axis">
      <HourlyBreakdownTooltipContent />
    </ChartsTooltipContainer>
  );
}

const SALES_AXIS_MIN_DEFAULT = 100;
const LABOR_AXIS_MIN_DEFAULT = 10;

export const HourlyBreakdownChart = ({
  xAxisLabels,
  salesData,
  laborCostData,
  height = 300,
  width,
}: HourlyBreakdownChartProps) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  const salesMax =
    salesData.length > 0
      ? Math.max(SALES_AXIS_MIN_DEFAULT, Math.max(...salesData) * 1.1)
      : SALES_AXIS_MIN_DEFAULT;
  const laborMax =
    laborCostData.length > 0
      ? computePaddedMax(laborCostData, { min: 100, padMultiplier: 1.1, step: 10 })
      : LABOR_AXIS_MIN_DEFAULT;

  const series = [
    {
      type: 'bar' as const,
      data: salesData,
      label: 'Sales Per hours',
      id: 'sales',
      yAxisId: 'salesAxis',
      color: '#FBC52A',
    },
    {
      type: 'line' as const,
      data: laborCostData,
      label: 'Labor Cost % Per hours',
      id: 'labor',
      yAxisId: 'laborAxis',
      color: '#EF4444',
      showMark: true,
    },
  ];

  const maxLabels = isDesktop ? 20 : 12;
  const tickStep = Math.max(1, Math.ceil(xAxisLabels.length / maxLabels));
  const tickLabelInterval = tickStep > 1
    ? (_v: unknown, i: number) => i % tickStep === 0
    : undefined;

  const xAxisConfig = isDesktop
    ? {
      data: xAxisLabels,
      scaleType: 'band' as const,
      id: 'x-axis',
      height: 40,
      tickLabelStyle: LABEL_FONT,
      ...(tickLabelInterval && { tickLabelInterval }),
    }
    : {
      data: xAxisLabels,
      scaleType: 'band' as const,
      id: 'x-axis',
      height: 26,
      tickLabelStyle: { ...LABEL_FONT, fontSize: 9 },
      ...(tickLabelInterval && { tickLabelInterval }),
    };

  // Compact tick labels ("$20K") on the sales axis so they don't crowd the
  // chart; tooltips/legend show full precision via `location` discriminator.
  const salesAxisFormatter = buildCurrencyAxisFormatter();
  const salesAxisConfig = isDesktop
    ? {
      id: 'salesAxis' as const,
      label: 'Sales ($)',
      min: 0,
      max: salesMax,
      tickNumber: 6,
      tickLabelStyle: LABEL_FONT,
      labelStyle: LABEL_FONT,
      valueFormatter: salesAxisFormatter,
    }
    : {
      id: 'salesAxis' as const,
      label: 'Sales ($)',
      min: 0,
      max: salesMax,
      tickNumber: 6,
      width: 52,
      tickLabelStyle: { ...LABEL_FONT, fontSize: 10, overflow: 'visible' },
      labelStyle: { ...LABEL_FONT, fontSize: 9 },
      valueFormatter: salesAxisFormatter,
    };

  const laborAxisConfig = isDesktop
    ? {
      id: 'laborAxis' as const,
      position: 'right' as const,
      label: 'Labor Cost (%)',
      min: 0,
      max: laborMax,
      tickNumber: 5,
      tickLabelStyle: LABEL_FONT,
      labelStyle: LABEL_FONT,
    }
    : {
      id: 'laborAxis' as const,
      position: 'right' as const,
      label: 'Labor Cost (%)',
      min: 0,
      max: laborMax,
      tickNumber: 5,
      width: 40,
      tickLabelStyle: { ...LABEL_FONT, fontSize: 10 },
      labelStyle: { ...LABEL_FONT, fontSize: 9 },
    };

  const hasData = xAxisLabels.length > 0;

  const tooltipContextValue = useMemo<HourlyBreakdownTooltipContextValue>(
    () => ({
      labels: xAxisLabels,
      sales: salesData,
      labor: laborCostData,
    }),
    [xAxisLabels, salesData, laborCostData]
  );

  const chartRef = useRef<SVGSVGElement>(null);
  const containerProps = useMemo(
    () => ({
      series,
      xAxis: [xAxisConfig],
      yAxis: [salesAxisConfig, laborAxisConfig],
      ...(width != null && { width }),
      height,
      margin: isDesktop ? desktopMargin : mobileMargin,
      children: (
        <>
          <ChartsGrid vertical horizontal />
          <BarPlot />
          <LinePlot />
          <MarkPlot />
          <ChartsAxisHighlight x="band" />
          <ChartsXAxis axisId="x-axis" />
          <ChartsYAxis axisId="salesAxis" />
          <ChartsYAxis axisId="laborAxis" />
        </>
      ),
    }),
    [
      series,
      xAxisConfig,
      salesAxisConfig,
      laborAxisConfig,
      width,
      height,
      isDesktop,
    ]
  );
  const { chartDataProviderProps, chartsSurfaceProps, children: surfaceChildren } =
    useChartContainerProps(containerProps, chartRef);

  if (!hasData) {
    return (
      <div className="flex flex-1 items-center justify-center py-12 text-center">
        <p className="text-sm text-secondary">No data to display</p>
      </div>
    );
  }

  return (
    <ThemeProvider theme={defaultTheme}>
      <HourlyBreakdownTooltipContext.Provider value={tooltipContextValue}>
        <ChartDataProvider {...chartDataProviderProps}>
          <ChartsSurface {...chartsSurfaceProps}>
            {surfaceChildren}
          </ChartsSurface>
          <HourlyBreakdownTooltipWithContainer trigger="axis" />
        </ChartDataProvider>
      </HourlyBreakdownTooltipContext.Provider>
    </ThemeProvider>
  );
};

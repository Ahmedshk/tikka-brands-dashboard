import { createContext, useContext, useMemo, type ComponentProps } from 'react';
import { axisTooltipRowDateSubline } from '../../utils/timeSeriesAxisTooltipHelpers';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { LineChart } from '@mui/x-charts/LineChart';
import { ChartsTooltipContainer, useAxesTooltip } from '@mui/x-charts/ChartsTooltip';

export interface TimeSeriesSeries {
  id: string;
  label: string;
  /** Y values; null skips/breaks the line (e.g. future hours). */
  data: (number | null)[];
  color?: string;
  /** Optional per-index label (e.g. calendar date) shown in axis tooltip for this series. */
  tooltipLabels?: string[];
}

export interface TimeSeriesLineChartYAxisOverrides {
  min?: number;
  max?: number;
  valueFormatter?: (value: number) => string;
  /** Optional axis label rendered alongside ticks (e.g. "Sales ($)"). */
  label?: string;
}

export interface TimeSeriesLineChartProps {
  /** X-axis labels (same length as each series data) */
  xAxisData: (string | number)[];
  /** One or more series (each data array length should match xAxisData) */
  series: TimeSeriesSeries[];
  height?: number;
  /** Optional colors in order; overrides series[].color if provided */
  colors?: string[];
  /** Optional Y-axis overrides (e.g. min, max, valueFormatter for currency) */
  yAxis?: TimeSeriesLineChartYAxisOverrides;
  /** Optional order of series IDs in the tooltip (e.g. ['today', 'lastWeek']) */
  tooltipSeriesOrder?: string[];
}

const defaultTheme = createTheme({
  palette: { mode: 'light' },
});

const LABEL_FONT = { fontFamily: 'Onest, sans-serif', fill: '#5B6B79' };

/**
 * Renders a tick label as two stacked `<tspan>` lines (date on top, weekday
 * below) so daily-granularity labels like "Mon, Apr 27" don't overlap on
 * narrow charts. Falls back to single-line rendering when the incoming `text`
 * isn't in the weekday map (e.g. hourly or monthly labels).
 *
 * Typed loosely because MUI X passes `ChartsTextProps`-shaped data plus our
 * extra `weekdayMap`/`mobile` from `slotProps.axisTickLabel`.
 */
function MultiLineAxisTickLabel(props: Record<string, unknown>) {
  const text = typeof props.text === 'string' ? props.text : String(props.text ?? '');
  const x = typeof props.x === 'number' ? props.x : Number(props.x) || 0;
  const y = typeof props.y === 'number' ? props.y : Number(props.y) || 0;
  const style = props.style as React.CSSProperties | undefined;
  const className = props.className as string | undefined;
  const weekdayMap = props.weekdayMap as
    | Map<string, { weekday: string; date: string }>
    | undefined;
  const mobile = props.mobile === true;
  const entry = weekdayMap?.get(text);
  // `dominantBaseline: hanging` makes the first `<tspan>` sit at the tick's y
  // anchor, with subsequent lines stacking downward via `dy`.
  const baseProps = {
    x,
    y,
    style,
    className,
    textAnchor: 'middle' as const,
    dominantBaseline: 'hanging' as const,
  };
  if (!entry?.weekday) {
    return <text {...baseProps}>{text}</text>;
  }
  const weekdayFontSize = mobile ? 8 : 10;
  return (
    <text {...baseProps}>
      <tspan x={x} dy={0}>{entry.date}</tspan>
      <tspan x={x} dy="1.25em" style={{ fontSize: weekdayFontSize, opacity: 0.85 }}>
        {entry.weekday}
      </tspan>
    </text>
  );
}

const desktopMargin = { top: 10, right: 35, bottom: 0, left: 0 };
const mobileMargin = { top: 4, right: 25, bottom: 0, left: 0 };

const TooltipSeriesOrderContext = createContext<string[] | undefined>(undefined);
const TooltipValueFormatterContext = createContext<((value: number) => string) | undefined>(undefined);
const TooltipLabelsBySeriesIdContext = createContext<Map<string, string[]> | undefined>(undefined);

function formatTooltipValue(
  value: unknown,
  formattedValue: string,
  valueFormatter?: (value: number) => string,
): string {
  const n =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : Number.parseFloat(
        String(formattedValue).replaceAll(',', '').replaceAll('$', ''),
      );
  if (Number.isNaN(n)) return formattedValue;
  if (valueFormatter) return valueFormatter(n);
  return formattedValue;
}

function TimeSeriesAxisTooltipContent() {
  const seriesOrder = useContext(TooltipSeriesOrderContext);
  const valueFormatter = useContext(TooltipValueFormatterContext);
  const tooltipLabelsBySeriesId = useContext(TooltipLabelsBySeriesIdContext);
  const axesTooltipData = useAxesTooltip();
  const firstAxis = axesTooltipData?.[0];
  if (!firstAxis || !axesTooltipData?.length) return null;
  const header = firstAxis.axisFormattedValue ?? String(firstAxis.axisValue ?? '—');
  const dataIndex =
    typeof firstAxis.dataIndex === 'number' && firstAxis.dataIndex >= 0 ? firstAxis.dataIndex : null;
  let rows = firstAxis.seriesItems ?? [];
  if (seriesOrder?.length) {
    const order = new Map(seriesOrder.map((id, i) => [id, i]));
    rows = [...rows].sort((a, b) => {
      const ai = order.has(String(a.seriesId)) ? order.get(String(a.seriesId))! : 999;
      const bi = order.has(String(b.seriesId)) ? order.get(String(b.seriesId))! : 999;
      return ai - bi;
    });
  }
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm min-w-[160px]">
      <p className="text-sm font-semibold text-primary pb-2 mb-2 border-b border-gray-100">
        {header}
      </p>
      <div className="space-y-2">
        {rows.map((item) => {
          const sid = String(item.seriesId);
          const perSeriesLabels = tooltipLabelsBySeriesId?.get(sid);
          const dateSubline = axisTooltipRowDateSubline(
            dataIndex,
            perSeriesLabels,
            sid,
            header,
          );
          return (
            <div key={item.seriesId} className="flex items-center gap-2 w-full">
              <span
                className="shrink-0 rounded-sm"
                style={{ width: 12, height: 3, backgroundColor: item.color }}
                aria-hidden
              />
              <span className="text-xs text-secondary flex-1 min-w-0 flex flex-col gap-0.5">
                <span>{item.formattedLabel ?? item.seriesId}</span>
                {dateSubline != null && (
                  <span className="text-[10px] text-gray-500 font-normal">{dateSubline}</span>
                )}
              </span>
              <span className="text-xs font-medium text-primary tabular-nums shrink-0">
                {formatTooltipValue(item.value, item.formattedValue, valueFormatter)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeSeriesAxisTooltip(
  props: Readonly<ComponentProps<typeof ChartsTooltipContainer>>
) {
  return (
    <ChartsTooltipContainer {...props} trigger="axis">
      <TimeSeriesAxisTooltipContent />
    </ChartsTooltipContainer>
  );
}

export const TimeSeriesLineChart = ({
  xAxisData,
  series,
  height = 256,
  colors,
  yAxis: yAxisOverrides,
  tooltipSeriesOrder,
}: TimeSeriesLineChartProps) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  const tooltipLabelsBySeriesId = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of series) {
      if (s.tooltipLabels != null && s.tooltipLabels.length > 0) {
        m.set(s.id, s.tooltipLabels);
      }
    }
    return m.size > 0 ? m : undefined;
  }, [series]);

  const chartSeries = series.map((s, index) => ({
    id: s.id,
    data: s.data,
    label: s.label,
    color: colors?.[index] ?? s.color,
  }));

  const maxVisibleLabels = isDesktop ? 20 : 12;
  const tickStep = Math.max(1, Math.ceil(xAxisData.length / maxVisibleLabels));
  const tickLabelInterval = tickStep > 1
    ? (_value: unknown, index: number) => index % tickStep === 0
    : undefined;

  // Daily labels arrive as "Mon, Apr 27". We render them as two stacked lines
  // (date on top, weekday underneath) so they don't overlap on narrow charts.
  // Direct `\n` in the formatter doesn't work because MUI X's `shortenLabels`
  // measures the text as a single SVG line and ellipsizes it down to "Mon".
  // Workaround:
  //   1. `valueFormatter` returns the SHORT form ("Apr 27") for the tick
  //      location — short enough that no shortening kicks in.
  //   2. Build a lookup of short → { weekday, date } so a custom
  //      `axisTickLabel` slot can render two `<tspan>` lines from the
  //      original (un-shortened) label.
  //   3. Bump the x-axis height to leave room for the second line.
  const weekdayLabelMap = useMemo(() => {
    const m = new Map<string, { weekday: string; date: string }>();
    for (const item of xAxisData) {
      const s = String(item);
      const match = /^([A-Za-z]{3,9}), (.+)$/.exec(s);
      if (match) {
        m.set(match[2]!, { weekday: match[1]!, date: match[2]! });
      }
    }
    return m;
  }, [xAxisData]);
  const hasWeekdayLabels = weekdayLabelMap.size > 0;

  const formatTickLabel = (value: unknown, context: { location: string }): string => {
    const str = String(value);
    if (context.location !== 'tick') return str;
    return str.replace(/^[A-Za-z]{3,9}, /, '');
  };

  const xAxisConfig = isDesktop
    ? {
      scaleType: 'point' as const,
      data: xAxisData,
      tickLabelStyle: LABEL_FONT,
      valueFormatter: formatTickLabel,
      ...(hasWeekdayLabels ? { height: 50 } : {}),
      ...(tickLabelInterval && { tickLabelInterval }),
    }
    : {
      scaleType: 'point' as const,
      data: xAxisData,
      tickLabelStyle: { ...LABEL_FONT, fontSize: 9 },
      valueFormatter: formatTickLabel,
      ...(hasWeekdayLabels ? { height: 40 } : {}),
      ...(tickLabelInterval && { tickLabelInterval }),
    };

  // Slots/slotProps go on the LineChart level (not the per-axis config) so MUI
  // X actually picks them up — per-axis slot wiring isn't honored by the high-
  // level chart wrappers. The slot is a no-op for the Y axis: its tick labels
  // ("$20K", "10K") aren't in the weekdayMap so the slot falls through to a
  // single-line render.
  const chartSlots = hasWeekdayLabels
    ? { tooltip: TimeSeriesAxisTooltip, axisTickLabel: MultiLineAxisTickLabel }
    : { tooltip: TimeSeriesAxisTooltip };
  const chartSlotProps = hasWeekdayLabels
    ? {
        tooltip: { trigger: 'axis' as const },
        axisTickLabel: { weekdayMap: weekdayLabelMap, mobile: !isDesktop },
      }
    : { tooltip: { trigger: 'axis' as const } };

  // Width tuned to fit compact currency ticks (e.g. `$1.2M`) plus a small
  // safety margin so non-currency formats (`12,345`, `123.45`) also fit.
  const baseYAxisConfig = isDesktop
    ? { width: 90, tickNumber: 5, tickLabelStyle: { ...LABEL_FONT, overflow: 'visible' }, labelStyle: LABEL_FONT }
    : { width: 72, tickNumber: 5, tickLabelStyle: { ...LABEL_FONT, fontSize: 10, overflow: 'visible' }, labelStyle: { ...LABEL_FONT, fontSize: 9 } };
  const yAxisConfig = yAxisOverrides
    ? { ...baseYAxisConfig, ...yAxisOverrides }
    : baseYAxisConfig;

  return (
    <ThemeProvider theme={defaultTheme}>
      <TooltipSeriesOrderContext.Provider value={tooltipSeriesOrder}>
        <TooltipValueFormatterContext.Provider value={yAxisOverrides?.valueFormatter}>
          <TooltipLabelsBySeriesIdContext.Provider value={tooltipLabelsBySeriesId}>
          <LineChart
            xAxis={[xAxisConfig]}
            yAxis={[yAxisConfig]}
            series={chartSeries}
            height={height}
            margin={isDesktop ? desktopMargin : mobileMargin}
            grid={{ vertical: true, horizontal: true }}
            hideLegend
            slots={chartSlots as never}
            slotProps={chartSlotProps as never}
          />
          </TooltipLabelsBySeriesIdContext.Provider>
        </TooltipValueFormatterContext.Provider>
      </TooltipSeriesOrderContext.Provider>
    </ThemeProvider>
  );
};

import { useRef } from 'react';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { BarChart } from '@mui/x-charts/BarChart';
import { VarianceItemsContext, VarianceTooltipWithContainer } from '../modal/VarianceChartModal';
import { Spinner } from '../common/Spinner';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';
const LABEL_FONT = { fontFamily: 'Onest, sans-serif', fill: '#5B6B79' };

/** Right margin so the last bar’s 3-line label is not clipped */
const desktopMargin = { top: 10, right: 10, bottom: 0, left: 0 };
const mobileMargin = { top: 4, right: 10, bottom: 0, left: 0 };

/** Bar band width (px) used for mobile; also passed to modal when opening from mobile */
const BAR_BAND_WIDTH = 120;

/** Shorter lines so labels stay within band and don’t overlap on laptop */
const MAX_CHARS_PER_LINE = 12;

function splitIntoLines(words: string[]): string[] {
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length <= MAX_CHARS_PER_LINE) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = w.length > MAX_CHARS_PER_LINE ? w.slice(0, MAX_CHARS_PER_LINE) : w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Wraps a label to at most maxLines lines (splits on spaces). */
function wrapLabelToMaxLines(label: string, maxLines: number): string {
  if (!label || maxLines < 1) return label;
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return label;
  const lines = splitIntoLines(words);
  const capped = lines.slice(0, maxLines);
  const lastIdx = maxLines - 1;
  if (lines.length > maxLines && capped[lastIdx]) {
    capped[lastIdx] = capped[lastIdx].slice(0, MAX_CHARS_PER_LINE - 3) + '...';
  }
  return capped.join('\n');
}

export interface VarianceChartItem {
  label: string;
  varianceCost: number;
  actualCost?: number;
  theoreticalCost?: number;
  actualQuantity?: number;
  theoreticalQuantity?: number;
  uom?: string;
}

export interface VarianceChartCardProps {
  /** Full list of variance items; card displays top 5 by absolute variance */
  items: VarianceChartItem[];
  /** Date range label (e.g. count period), shown next to title like other cards */
  timePeriod?: string | null;
  /** Show centered spinner while waiting for API */
  loading?: boolean;
  /** Called when "View All" is clicked; receives the card's bar band width (px) so the modal can match it */
  onViewAll?: (barBandWidth: number) => void;
}

/** Top 5 items by absolute variance (descending); card shows these in descending order of |variance|. */
function getTop5VarianceItems(items: VarianceChartItem[]): VarianceChartItem[] {
  return [...items]
    .sort((a, b) => Math.abs(b.varianceCost) - Math.abs(a.varianceCost))
    .slice(0, 5);
}

const defaultTheme = createTheme({
  palette: { mode: 'light' },
});

const currencyFormatter = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

export const VarianceChartCard = ({ items, timePeriod = null, loading = false, onViewAll }: VarianceChartCardProps) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const top5 = getTop5VarianceItems(items);
  const labels = top5.map((i) => i.label);
  const values = top5.map((i) => i.varianceCost);

  const handleViewAll = () => {
    if (onViewAll == null || items.length <= 5) return;
    if (!isDesktop) {
      onViewAll(BAR_BAND_WIDTH);
      return;
    }
    const el = chartContainerRef.current;
    if (el) {
      const containerWidth = el.offsetWidth;
      const marginH = 15 + 15;
      const plotWidth = Math.max(0, containerWidth - marginH);
      onViewAll(plotWidth / 5);
    } else {
      onViewAll(BAR_BAND_WIDTH);
    }
  };

  return (
    <div className={cardClass}>
      <div className="p-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <p className="text-sm md:text-base 2xl:text-lg font-semibold text-secondary mb-0.5 flex items-center gap-2 flex-wrap">
            <span>Food Cost Variance (Actual - Theoretical)</span>
            {timePeriod != null && timePeriod !== '' && (
              <span className="text-[10px] md:text-xs 2xl:text-sm font-normal text-primary">
                ({timePeriod})
              </span>
            )}
          </p>
          <p className="text-[10px] md:text-xs 2xl:text-sm text-primary mt-0.5">
            Top 5 items with highest absolute variance.
          </p>
        </div>
        {onViewAll != null && items.length > 5 && !loading && (
          <button
            type="button"
            onClick={handleViewAll}
            className="text-[10px] md:text-xs 2xl:text-sm font-bold text-quaternary hover:underline cursor-pointer self-start sm:self-center"
            title="View all items"
          >
            View All &gt;
          </button>
        )}
      </div>
      <div
        ref={chartContainerRef}
        className="scrollbar-touch overflow-x-auto md:overflow-visible px-5 pb-5 min-h-[280px]"
      >
        {loading ? (
          <div className="flex items-center justify-center min-h-[280px]">
            <Spinner size="lg" className="text-button-primary" />
          </div>
        ) : (
          <ThemeProvider theme={defaultTheme}>
            <VarianceItemsContext.Provider value={top5}>
              <BarChart
                width={isDesktop ? undefined : 5 * BAR_BAND_WIDTH}
                height={280}
                margin={isDesktop ? desktopMargin : mobileMargin}
                xAxis={[
                  {
                    scaleType: 'band',
                    data: labels,
                    tickLabelStyle: { ...LABEL_FONT, fontSize: 11 },
                    valueFormatter: (value: string) => wrapLabelToMaxLines(value, 3),
                    tickLabelInterval: () => true,
                    tickLabelPlacement: 'middle',
                    height: 72,
                  },
                ]}
                yAxis={[
                  {
                    label: 'Variance ($)',
                    tickLabelStyle: { ...LABEL_FONT, fontSize: 11 },
                    valueFormatter: (v: number) => `$${v}`,
                    colorMap: {
                      type: 'piecewise',
                      thresholds: [0],
                      colors: ['#22C55E', '#EF4444'],
                    },
                  },
                ]}
                series={[
                  {
                    data: values,
                    label: 'Variance',
                    id: 'variance',
                    valueFormatter: (v) => (v == null ? '' : currencyFormatter(v)),
                    barLabel: (item) => (item.value == null ? '' : currencyFormatter(item.value)),
                  },
                ]}
                grid={{ vertical: true, horizontal: true }}
                hideLegend
                slotProps={{ tooltip: { trigger: 'axis' } }}
                slots={{ tooltip: VarianceTooltipWithContainer }}
              />
            </VarianceItemsContext.Provider>
          </ThemeProvider>
        )}
      </div>
    </div>
  );
};

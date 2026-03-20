import { createTheme, ThemeProvider, styled } from '@mui/material/styles';
import { PieChart } from '@mui/x-charts/PieChart';
import { useDrawingArea } from '@mui/x-charts/hooks';
import { Spinner } from '../common/Spinner';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

const defaultTheme = createTheme({
  palette: { mode: 'light' },
});

const StyledText = styled('text')(({ theme }) => ({
  fill: theme.palette.text.primary,
  textAnchor: 'middle',
  dominantBaseline: 'central',
  fontSize: 14,
}));

function DonutCenterLabel({ value, label }: { readonly value: string; readonly label: string }) {
  const { width, height, left, top } = useDrawingArea();
  const cx = left + width / 2;
  const cy = top + height / 2;
  return (
    <StyledText x={cx} y={cy}>
      <tspan x={cx} dy="0" style={{ fontWeight: 700, fontSize: 18 }}>
        {value}
      </tspan>
      <tspan x={cx} dy="18" style={{ fontWeight: 600, fontSize: 11 }}>
        {label}
      </tspan>
    </StyledText>
  );
}

export interface ReviewTrackerSegment {
  id: string;
  label: string;
  count: number;
  color: string;
}

export interface ReviewTrackerDonut {
  id: string;
  title: string;
  total: number;
  segments: ReviewTrackerSegment[];
}

export interface ReviewTrackerCardProps {
  donut: ReviewTrackerDonut;
  /** When true, shows a centered spinner instead of the chart (title unchanged). */
  loading?: boolean;
}

export const ReviewTrackerCard = ({ donut, loading = false }: ReviewTrackerCardProps) => {
  if (loading) {
    return (
      <div className={`${cardClass} p-3 h-full flex flex-col`}>
        <div className="pb-1 flex items-center justify-center">
          <h4 className="text-xs md:text-sm 2xl:text-base font-semibold text-secondary text-center">{donut.title}</h4>
        </div>
        <div
          className="flex flex-1 min-h-[120px] items-center justify-center py-2"
          aria-busy="true"
        >
          <Spinner size="lg" className="text-button-primary" />
        </div>
        <div className="mt-1 flex-1 min-h-[60px]" aria-hidden />
      </div>
    );
  }

  const chartData = donut.segments
    .filter((segment) => segment.count > 0)
    .map((segment) => ({ id: segment.id, value: segment.count, color: segment.color }));
  const pieData = chartData.length > 0 ? chartData : [{ id: `${donut.id}-empty`, value: 1, color: '#E5E7EB' }];
  return (
    <div className={`${cardClass} p-3 h-full flex flex-col`}>
      <div className="pb-1 flex items-center justify-center">
        <h4 className="text-xs md:text-sm 2xl:text-base font-semibold text-secondary text-center">{donut.title}</h4>
      </div>
      <ThemeProvider theme={defaultTheme}>
        <div className="flex items-center justify-center">
          <PieChart
            series={[
              {
                data: pieData,
                innerRadius: 32,
                outerRadius: 48,
                paddingAngle: 2,
                highlightScope: { fade: 'global', highlight: 'item' },
              },
            ]}
            width={120}
            height={120}
            hideLegend
          >
            <DonutCenterLabel value={String(donut.total)} label={donut.total === 1 ? "review" : "reviews"} />
          </PieChart>
        </div>
        <div className="mt-1 space-y-0.5 text-[10px] text-primary flex-1">
          {donut.segments.map((segment) => {
            const percent = donut.total > 0 ? Math.round((segment.count / donut.total) * 100) : 0;
            return (
              <div key={segment.id} className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden />
                <span className="font-medium text-secondary truncate flex-1">{segment.label}</span>
                <span>{segment.count}</span>
                <span>({percent}%)</span>
              </div>
            );
          })}
        </div>
      </ThemeProvider>
    </div>
  );
};

import { createTheme, ThemeProvider, styled } from '@mui/material/styles';
import { PieChart } from '@mui/x-charts/PieChart';
import { useDrawingArea } from '@mui/x-charts/hooks';

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
      <tspan x={cx} dy="0" style={{ fontWeight: 700, fontSize: 22 }}>
        {value}
      </tspan>
      <tspan x={cx} dy="24" style={{ fontWeight: 600, fontSize: 14 }}>
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
  donuts: ReviewTrackerDonut[];
}

export const ReviewTrackerCard = ({ donuts }: ReviewTrackerCardProps) => {
  return (
    <div className={`${cardClass} flex flex-col h-full min-h-0`}>
      <div className="p-5 pb-4 flex items-center justify-center flex-shrink-0">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-secondary text-center">Current Reviews Tracker</h3>
      </div>
      <div className="px-4 pb-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto">
        <ThemeProvider theme={defaultTheme}>
          {donuts.map((donut) => {
            const chartData = donut.segments
              .filter((segment) => segment.count > 0)
              .map((segment) => ({ id: segment.id, value: segment.count, color: segment.color }));
            const pieData = chartData.length > 0 ? chartData : [{ id: `${donut.id}-empty`, value: 1, color: '#E5E7EB' }];
            return (
              <section key={donut.id} className="border border-gray-100 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-secondary uppercase tracking-wide text-center mb-1">{donut.title}</h4>
                <div className="flex items-center justify-center">
                  <PieChart
                    series={[
                      {
                        data: pieData,
                        innerRadius: 45,
                        outerRadius: 65,
                        paddingAngle: 2,
                        highlightScope: { fade: 'global', highlight: 'item' },
                      },
                    ]}
                    width={170}
                    height={170}
                    hideLegend
                  >
                    <DonutCenterLabel value={String(donut.total)} label="cycles" />
                  </PieChart>
                </div>
                <div className="mt-1 space-y-1 text-[11px] text-primary">
                  {donut.segments.map((segment) => {
                    const percent = donut.total > 0 ? Math.round((segment.count / donut.total) * 100) : 0;
                    return (
                      <div key={segment.id} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden />
                        <span className="font-medium text-secondary truncate flex-1">{segment.label}</span>
                        <span>{segment.count}</span>
                        <span>({percent}%)</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </ThemeProvider>
      </div>
    </div>
  );
};

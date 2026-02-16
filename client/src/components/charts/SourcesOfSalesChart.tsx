import { createTheme, ThemeProvider, styled } from '@mui/material/styles';
import { PieChart } from '@mui/x-charts/PieChart';
import { useDrawingArea } from '@mui/x-charts/hooks';

export interface SourcesOfSalesSegment {
  id: string;
  label: string;
  value: number;
  amount: string;
  color: string;
}

export interface SourcesOfSalesChartProps {
  totalSales: string;
  segments: SourcesOfSalesSegment[];
  height?: number;
}

const defaultTheme = createTheme({
  palette: { mode: 'light' },
});

const StyledText = styled('text')(({ theme }) => ({
  fill: theme.palette.text.primary,
  textAnchor: 'middle',
  dominantBaseline: 'middle',
  fontSize: 14,
}));

function PieCenterLabel({ label, value }: { readonly label: string; readonly value: string }) {
  const { width, height, left, top } = useDrawingArea();
  const cx = left + width / 2;
  const cy = top + height / 2;
  return (
    <StyledText x={cx} y={cy}>
      <tspan x={cx} dy="-0.5em" style={{ fontWeight: 600, fontSize: 12 }}>
        {label}
      </tspan>
      <tspan x={cx} dy="22" style={{ fontWeight: 700, fontSize: 16 }}>
        {value}
      </tspan>
    </StyledText>
  );
}

export const SourcesOfSalesChart = ({
  totalSales,
  segments,
  height = 280,
}: SourcesOfSalesChartProps) => {
  const pieData = segments.map((s) => ({
    id: s.id,
    label: s.label,
    value: s.value,
    color: s.color,
    amount: s.amount,
  }));

  const hasData = segments.length > 0;

  return (
    <ThemeProvider theme={defaultTheme}>
      <div className="flex flex-col items-center" style={{ minHeight: height }}>
        {hasData ? (
          <>
            <PieChart
              series={[
                {
                  data: pieData,
                  innerRadius: 60,
                  outerRadius: 90,
                  paddingAngle: 2,
                  highlightScope: { fade: 'global', highlight: 'item' },
                  valueFormatter: (item: { value: number; amount?: string }) => {
                    const percent = item.value;
                    const amount = item.amount;
                    if (amount !== undefined) return `${amount} (${percent}%)`;
                    return `${percent}%`;
                  },
                },
              ]}
              width={280}
              height={height}
              hideLegend
            >
              <PieCenterLabel label="Total Sales" value={totalSales} />
            </PieChart>
            {/* Custom legend: source name, amount, percentage */}
            <div className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-primary">
              {segments.map((s) => (
                <span key={s.id} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden
                  />
                  <span className="font-medium text-secondary">{s.label}</span>
                  <span>{s.amount}</span>
                  <span>({s.value}%)</span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-secondary leading-normal">No data to display</p>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
};

import { LinearProgress, Tooltip } from '@mui/material';
import { TREND_POSITIVE, TREND_NEGATIVE, TREND_PENDING } from '../../constants/trendColors';

export interface TargetActualItem {
  label: string;
  actual: number;
  target: number;
  /** true = higher is better (e.g. sales), false = lower is better (e.g. labor %, hours) */
  higherIsBetter: boolean;
  /** Optional tolerance; when unfavorable but within tolerance, progress bar uses tolerance color */
  targetTolerance?: number;
  /** Optional tooltip text (e.g. "Goal: Meet or Exceed $1,000.00") shown on info icon hover */
  goalTooltip?: string;
  /** Optional formatter for display (e.g. currency, percent) */
  formatValue?: (n: number) => string;
}

export interface DailyTargetsCardProps {
  items: TargetActualItem[];
}

const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary/70 shrink-0" aria-hidden>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const DailyTargetsCard = ({ items }: DailyTargetsCardProps) => {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1 text-[10px] md:text-xs 2xl:text-sm text-secondary mb-5">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: TREND_POSITIVE }} aria-hidden />
          <span>On Track</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: TREND_PENDING }} aria-hidden />
          <span>Caution</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: TREND_NEGATIVE }} aria-hidden />
          <span>Needs Attention</span>
        </span>
      </div>
      {items.map((item) => {
        const format = item.formatValue ?? String;
        const isUnfavorable = item.higherIsBetter
          ? item.actual < item.target
          : item.actual > item.target;
        const tol = item.targetTolerance ?? 0;
        const withinTolerance =
          isUnfavorable &&
          tol > 0 &&
          (item.higherIsBetter
            ? item.actual >= item.target - tol
            : item.actual <= item.target + tol);
        const displayPercent = item.target === 0
          ? 0
          : Math.min(100, Math.round((item.actual / item.target) * 100));
        let barColor: string;
        if (withinTolerance) {
          barColor = TREND_PENDING;
        } else if (isUnfavorable) {
          barColor = TREND_NEGATIVE;
        } else {
          barColor = TREND_POSITIVE;
        }

        return (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between text-[10px] md:text-xs 2xl:text-sm gap-2">
              <span className="font-medium text-secondary flex items-center gap-1 min-w-0">
                {item.label}
                {item.goalTooltip != null && item.goalTooltip !== '' && (
                  <Tooltip title={item.goalTooltip} placement="top" arrow enterDelay={200}>
                    <button type="button" className="inline-flex cursor-help p-0 border-0 bg-transparent" aria-label="Goal info">
                      <InfoIcon />
                    </button>
                  </Tooltip>
                )}
              </span>
              <span className="text-primary shrink-0">
                {format(item.actual)} / {format(item.target)}
              </span>
            </div>
            <LinearProgress
              variant="determinate"
              value={displayPercent}
              sx={{
                height: 8,
                borderRadius: 4,
                '& .MuiLinearProgress-bar': { backgroundColor: barColor },
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

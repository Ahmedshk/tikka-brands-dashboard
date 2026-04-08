import { useMemo } from 'react';
import { PercentageGauge } from '../gauges/PercentageGauge';
import { Spinner } from '../common/Spinner';

const POSITIVE_COLOR = '#5DC54F';
const NEGATIVE_COLOR = '#F04B5B';
const TOLERANCE_COLOR = '#FDB90E';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

export interface CostOfGoodsSoldCardProps {
  /** Current food cost % (from ActualUsagePercent) */
  value?: number;
  /** Target food cost % (from store goals) */
  goal?: number | null;
  /** Tolerance %; band above goal from goal to (goal + tolerance) shown in #FDB90E; over goal but within tolerance uses tolerance color */
  goalTolerance?: number | null;
  /** Date range label, shown like KPI cards */
  timePeriod?: string | null;
  /** value − goal; positive = over target (red), negative = under target (green) */
  overTarget?: number | null;
  /** Theoretical usage $ (from ActualTheoCategoriesTotalsRows) */
  theoreticalUsage?: number | null;
  /** Theoretical usage % (from ActualTheoCategoriesTotalsRows, 0–100) */
  theoreticalUsagePercent?: number | null;
  /** Actual usage $ (from ActualTheoCategoriesTotalsRows) */
  actualUsage?: number | null;
  /** Actual usage % (same as value; 0–100) */
  actualUsagePercent?: number | null;
  /** Show centered spinner while waiting for API */
  loading?: boolean;
  subtitle?: string;
  size?: number;
  className?: string;
}

export const CostOfGoodsSoldCard = ({
  value = 0,
  goal = null,
  goalTolerance = null,
  timePeriod = null,
  overTarget = null,
  theoreticalUsage = null,
  theoreticalUsagePercent = null,
  actualUsage = null,
  actualUsagePercent = null,
  loading = false,
  subtitle = 'Food Cost as % of Net Sales',
  size = 320,
  className = '',
}: CostOfGoodsSoldCardProps) => {
  const { segmentStops, segmentColors } = useMemo(() => {
    const g = goal ?? 0;
    const tol = goalTolerance ?? 0;
    if (g <= 0) {
      return { segmentStops: [100] as number[], segmentColors: [NEGATIVE_COLOR] };
    }
    if (g >= 100) {
      return { segmentStops: [100] as number[], segmentColors: [POSITIVE_COLOR] };
    }
    if (tol > 0) {
      const high = Math.min(100, g + tol);
      return {
        segmentStops: [g, high, 100],
        segmentColors: [POSITIVE_COLOR, TOLERANCE_COLOR, NEGATIVE_COLOR],
      };
    }
    return {
      segmentStops: [g, 100],
      segmentColors: [POSITIVE_COLOR, NEGATIVE_COLOR],
    };
  }, [goal, goalTolerance]);

  const overTargetWithinTolerance =
    overTarget != null &&
    overTarget > 0 &&
    goal != null &&
    (goalTolerance ?? 0) > 0 &&
    value <= goal + (goalTolerance ?? 0);

  return (
    <div className={`${cardClass} ${className}`}>
      <div className="p-5 flex flex-col h-full min-h-[280px]">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <p className="text-sm md:text-base 2xl:text-lg font-semibold text-secondary flex items-center gap-2 flex-wrap">
            <span>Cost of Goods Sold Gauge</span>
            {timePeriod != null && timePeriod !== '' && (
              <span className="text-[10px] md:text-xs 2xl:text-sm font-normal text-primary">
                ({timePeriod})
              </span>
            )}
          </p>
        </div>
        <p className="text-[10px] md:text-xs 2xl:text-sm text-primary mt-0.5">
          Current Food Cost % vs. Target
        </p>
        {loading ? (
          <div className="flex flex-1 min-h-[200px] items-center justify-center">
            <Spinner size="lg" className="text-button-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 md:items-stretch gap-4 mt-4 flex-1 min-h-0">
            <div className="md:col-span-7 2xl:col-span-5 md:self-center border border-gray-200 rounded-lg bg-white px-3 py-2 flex flex-col">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs md:text-sm text-primary">Theoretical Usage</span>
                <span className="font-semibold text-secondary text-sm md:text-base">
                  {theoreticalUsage == null ? '—' : formatCurrency(theoreticalUsage)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 mt-1">
                <span className="text-xs md:text-sm text-primary">Theoretical Usage %</span>
                <span className="font-semibold text-secondary text-sm md:text-base">
                  {theoreticalUsagePercent == null ? '—' : `${theoreticalUsagePercent.toFixed(2)}%`}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 mt-2 pt-2 border-t border-gray-100">
                <span className="text-xs md:text-sm text-primary">Actual Usage</span>
                <span className="font-semibold text-secondary text-sm md:text-base">
                  {actualUsage == null ? '—' : formatCurrency(actualUsage)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 mt-1">
                <span className="text-xs md:text-sm text-primary">Actual Usage %</span>
                <span className="font-semibold text-secondary text-sm md:text-base">
                  {actualUsagePercent == null ? '—' : `${actualUsagePercent.toFixed(2)}%`}
                </span>
              </div>
            </div>
            <div className="md:col-span-5 md:col-start-8 flex items-center justify-center min-h-[200px] md:min-h-0 w-full max-w-full">
              <PercentageGauge
                value={value}
                min={0}
                max={100}
                unit=" %"
                subtitle={subtitle}
                overTarget={overTarget ?? null}
                overTargetWithinTolerance={overTargetWithinTolerance}
                overTargetToleranceColor={TOLERANCE_COLOR}
                segmentStops={segmentStops}
                segmentColors={segmentColors}
                goalTick={goal ?? null}
                size={size}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

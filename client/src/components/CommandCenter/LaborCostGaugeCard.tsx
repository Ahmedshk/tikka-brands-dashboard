import { useMemo } from 'react';
import { PercentageGauge } from '../gauges/PercentageGauge';

const POSITIVE_COLOR = '#5DC54F';
const NEGATIVE_COLOR = '#F04B5B';

export interface LaborCostGaugeCardProps {
  value: number;
  /** Goal percentage; gauge shows green 0→goal, red goal→100. If omitted, uses default segments. */
  goal?: number | null;
  subtitle?: string;
  overTarget?: number | null;
  size?: number;
  /** Optional className for the card wrapper (e.g. for grid sizing) */
  className?: string;
}

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

export const LaborCostGaugeCard = ({
  value,
  goal = null,
  subtitle = 'Labor vs Goals',
  overTarget = null,
  size = 340,
  className = '',
}: LaborCostGaugeCardProps) => {
  const { segmentStops, segmentColors } = useMemo(() => {
    const g = goal ?? 0;
    if (g <= 0) {
      return { segmentStops: [100] as number[], segmentColors: [NEGATIVE_COLOR] };
    }
    if (g >= 100) {
      return { segmentStops: [100] as number[], segmentColors: [POSITIVE_COLOR] };
    }
    return {
      segmentStops: [g, 100],
      segmentColors: [POSITIVE_COLOR, NEGATIVE_COLOR],
    };
  }, [goal]);

  return (
    <div className={`${cardClass} ${className}`}>
      <div className="p-5 flex flex-col items-center">
        <h3 className="text-sm font-semibold text-secondary mb-4 text-center">Labor Cost Percentage Gauge</h3>
        <div className="flex justify-center w-full">
          <PercentageGauge
            value={value}
            subtitle={subtitle}
            overTarget={overTarget}
            size={size}
            segmentStops={segmentStops}
            segmentColors={segmentColors}
            goalTick={goal ?? null}
          />
        </div>
      </div>
    </div>
  );
};

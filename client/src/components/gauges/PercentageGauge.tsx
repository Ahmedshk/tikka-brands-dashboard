import React from 'react';
import GaugeComponent from 'react-gauge-component';
import IncreaseDownIcon from '@assets/icons/increase_down.svg?react';
import DecreaseUpIcon from '@assets/icons/decrease_up.svg?react';

export interface PercentageGaugeProps {
  /** Current value (e.g. 0–100 for percentage) */
  value: number;
  min?: number;
  max?: number;
  /** Unit suffix (e.g. '%') */
  unit?: string;
  /** Subtitle below the value (e.g. "Labor vs Goals") */
  subtitle?: string;
  /** If set, show "X% Over Target" in red; if negative, show "X% Under Target" */
  overTarget?: number | null;
  /** When true and overTarget > 0, show the over-target line in tolerance color (e.g. within tolerance) */
  overTargetWithinTolerance?: boolean;
  /** Color for the over-target line when within tolerance (e.g. #FDB90E) */
  overTargetToleranceColor?: string;
  /** Segment limits (upper bound per segment); default [33, 66, 100] for green/yellow/red */
  segmentStops?: number[];
  /** Colors for segments (default green, yellow, red) */
  segmentColors?: string[];
  /** If set, show a tick mark on the arc at this value (e.g. goal line) */
  goalTick?: number | null;
  /** Gauge size (e.g. max width); component is responsive */
  size?: number;
}

const DEFAULT_SEGMENT_STOPS = [33, 66, 100];
const DEFAULT_SEGMENT_COLORS = ['#22C55E', '#EAB308', '#EF4444'];

const INTERVAL_TICKS = [0, 20, 40, 60, 80, 100];
const GOAL_TICK_COLOR = '#000000';

function buildTicks(goalTick: number | null): number[] {
  if (goalTick == null || goalTick <= 0 || goalTick >= 100) {
    return INTERVAL_TICKS;
  }
  const hasGoal = INTERVAL_TICKS.some((t) => Math.abs(t - goalTick) < 1);
  if (hasGoal) {
    return INTERVAL_TICKS;
  }
  return [...INTERVAL_TICKS, goalTick].sort((a, b) => a - b);
}

export const PercentageGauge = ({
  value,
  min = 0,
  max = 100,
  unit = '%',
  subtitle,
  overTarget = null,
  overTargetWithinTolerance = false,
  overTargetToleranceColor = '#FDB90E',
  segmentStops = DEFAULT_SEGMENT_STOPS,
  segmentColors = DEFAULT_SEGMENT_COLORS,
  goalTick = null,
  size = 280,
}: PercentageGaugeProps) => {
  const subArcs = segmentStops.map((limit, i) => ({
    limit,
    color: segmentColors[i] ?? segmentColors.at(-1) ?? '#6B7280',
    showTick: false,
  }));

  const tickValues = buildTicks(goalTick);
  const isGoalTick = (v: number) =>
    goalTick != null && Math.abs(v - goalTick) < 0.5;
  const showLabel = (v: number) =>
    v === 0 || v === 100 || isGoalTick(v);
  const ticks = tickValues.map((v) => {
    if (isGoalTick(v)) {
      return {
        value: v,
        valueConfig: { style: { fill: GOAL_TICK_COLOR, fontWeight: 'bold' } },
        lineConfig: { color: GOAL_TICK_COLOR },
      };
    }
    if (!showLabel(v)) {
      return { value: v, valueConfig: { hide: true } };
    }
    return { value: v };
  });
  const formatTickLabel = (val: number): string =>
    goalTick != null && Math.abs(val - goalTick) < 0.5 ? `${val}% (Goal)` : `${val}%`;

  const formatValue = (val: number) => `${val.toFixed(2)}${unit}`;

  function getStatusLineClass(): string {
    if (overTarget == null) return '';
    if (overTarget === 0) return 'text-positive';
    if (overTarget > 0 && overTargetWithinTolerance) return '';
    if (overTarget > 0) return 'text-negative';
    return 'text-positive';
  }

  function renderStatusLineContent(): React.ReactNode {
    if (overTarget == null) return null;
    if (overTarget === 0) return 'On Target';
    if (overTarget > 0) {
      return (
        <>
          <span className="inline-flex shrink-0" style={{ transform: 'rotate(180deg)' }} aria-hidden>
            <IncreaseDownIcon className="w-3.5 h-3 [&_path]:fill-current" />
          </span>
          {`${overTarget.toFixed(2)}% Over Target`}
        </>
      );
    }
    return (
      <>
        <span className="inline-flex shrink-0" style={{ transform: 'rotate(180deg)' }} aria-hidden>
          <DecreaseUpIcon className="w-3.5 h-3 [&_path]:fill-current" />
        </span>
        {`${Math.abs(overTarget).toFixed(2)}% Under Target`}
      </>
    );
  }

  return (
    <div className="flex flex-col items-center" style={{ maxWidth: size }}>
      <GaugeComponent
        type="semicircle"
        arc={{
          width: 0.2,
          padding: 0.01,
          subArcs,
          cornerRadius: 2,
        }}
        pointer={{
          type: 'needle',
          color: '#6B7280',
          baseColor: '#9CA3AF',
          length: 0.7,
          width: 15,
          animate: true,
          elastic: false,
        }}
        labels={{
          valueLabel: {
            hide: true,
          },
          tickLabels: {
            type: 'inner',
            hideMinMax: false,
            ticks,
            defaultTickValueConfig: {
              formatTextValue: formatTickLabel,
            },
          },
        }}
        minValue={min}
        maxValue={max}
        value={value}
        style={{ width: '100%' }}
      />
      <p className="text-2xl font-bold text-secondary mt-2">{formatValue(value)}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      {overTarget != null && (
        <>
          <hr className="w-full border-gray-200 mt-3 mb-2" />
          <p
            className={`flex items-center justify-center gap-1 text-sm font-bold ${getStatusLineClass()}`}
            style={
              overTarget > 0 && overTargetWithinTolerance
                ? { color: overTargetToleranceColor }
                : undefined
            }
          >
            {renderStatusLineContent()}
          </p>
        </>
      )}
    </div>
  );
};

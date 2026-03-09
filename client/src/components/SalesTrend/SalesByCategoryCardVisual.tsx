import { TREND_POSITIVE, TREND_NEGATIVE } from '../../constants/trendColors';
import type { SalesByCategoryItem } from './SalesByCategoryCard';
import {
  COMPARISON_BAR_COLOR,
  formatCurrency,
  formatPercentDisplayVisual,
  getPercentColorClass,
  getTrendColor,
  getPercentChange,
  computeCardMaxValue,
} from '../../utils/salesByCategoryCardHelpers';

export interface SalesByCategoryCardVisualProps {
  displayItems: SalesByCategoryItem[];
  totalCurrent: number;
  totalComparison: number;
  totalPercentChange: number | null;
  currentPeriodLabel: string;
  comparisonPeriodLabel: string;
  periodDateRange?: string;
  comparisonDateRange?: string;
}

function BarRow({
  widthPercent,
  color,
  minWidth,
  valueFormatted,
}: Readonly<{
  widthPercent: number;
  color: string;
  minWidth: number;
  valueFormatted: string;
}>) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0 rounded overflow-hidden bg-white" style={{ height: 8 }}>
        <div
          className="h-full rounded"
          style={{
            width: `${widthPercent}%`,
            backgroundColor: color,
            minWidth: minWidth > 0 ? 2 : 0,
          }}
        />
      </div>
      <span className="text-[10px] md:text-xs 2xl:text-sm text-primary font-semibold shrink-0">
        {valueFormatted}
      </span>
    </div>
  );
}

export function SalesByCategoryCardVisual({
  displayItems,
  totalCurrent,
  totalComparison,
  totalPercentChange,
  currentPeriodLabel,
  comparisonPeriodLabel,
  periodDateRange,
  comparisonDateRange,
}: Readonly<SalesByCategoryCardVisualProps>) {
  const cardMaxValue = computeCardMaxValue(displayItems, totalCurrent, totalComparison);
  const totalCurrentPct = cardMaxValue > 0 ? (totalCurrent / cardMaxValue) * 100 : 0;
  const totalComparisonPct = cardMaxValue > 0 ? (totalComparison / cardMaxValue) * 100 : 0;

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 text-xs text-primary">
        <span className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm shrink-0"
            style={{ backgroundColor: TREND_POSITIVE }}
            aria-hidden
          />
          <span>
            {currentPeriodLabel}
            {' '}
            (increase)
            {periodDateRange != null && periodDateRange !== '' && (
              <span className="block text-[10px] text-gray-500 font-normal">{periodDateRange}</span>
            )}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm shrink-0"
            style={{ backgroundColor: TREND_NEGATIVE }}
            aria-hidden
          />
          <span>
            {currentPeriodLabel}
            {' '}
            (decrease)
            {periodDateRange != null && periodDateRange !== '' && (
              <span className="block text-[10px] text-gray-500 font-normal">{periodDateRange}</span>
            )}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm shrink-0"
            style={{ backgroundColor: COMPARISON_BAR_COLOR }}
            aria-hidden
          />
          <span>
            {comparisonPeriodLabel}
            {comparisonDateRange != null && comparisonDateRange !== '' && (
              <span className="block text-[10px] text-gray-500 font-normal">
                {comparisonDateRange}
              </span>
            )}
          </span>
        </span>
      </div>
      <div className="space-y-3">
        {displayItems.map((item) => {
          const currentPercent = cardMaxValue > 0 ? (item.currentValue / cardMaxValue) * 100 : 0;
          const comparisonPercent =
            cardMaxValue > 0 ? (item.comparisonValue / cardMaxValue) * 100 : 0;
          const currentBarColor = getTrendColor(item.currentValue, item.comparisonValue);
          const percentChange = getPercentChange(item.currentValue, item.comparisonValue);

          return (
            <div
              key={item.label}
              className="rounded-lg border border-gray-200 bg-gray-50/50 p-3"
            >
              <div className="mb-1 text-[10px] md:text-xs 2xl:text-sm font-medium text-secondary flex items-center gap-1.5">
                <span>{item.label}</span>
                <span className={`shrink-0 font-semibold ${getPercentColorClass(percentChange)}`}>
                  {formatPercentDisplayVisual(percentChange)}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <BarRow
                  widthPercent={currentPercent}
                  color={currentBarColor}
                  minWidth={item.currentValue}
                  valueFormatted={formatCurrency(item.currentValue)}
                />
                <BarRow
                  widthPercent={comparisonPercent}
                  color={COMPARISON_BAR_COLOR}
                  minWidth={item.comparisonValue}
                  valueFormatted={formatCurrency(item.comparisonValue)}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t-2 border-gray-200 pt-4 mt-4">
        <div className="mb-1 text-[10px] md:text-xs 2xl:text-sm font-semibold text-secondary flex items-center gap-1.5">
          <span>Total</span>
          <span className={`shrink-0 font-semibold ${getPercentColorClass(totalPercentChange)}`}>
            {formatPercentDisplayVisual(totalPercentChange)}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <BarRow
            widthPercent={totalCurrentPct}
            color={getTrendColor(totalCurrent, totalComparison)}
            minWidth={totalCurrent}
            valueFormatted={formatCurrency(totalCurrent)}
          />
          <BarRow
            widthPercent={totalComparisonPct}
            color={COMPARISON_BAR_COLOR}
            minWidth={totalComparison}
            valueFormatted={formatCurrency(totalComparison)}
          />
        </div>
      </div>
    </>
  );
}

import {
  COMPARISON_BAR_COLOR,
  formatCurrency,
  formatPercentDisplay,
  formatPercentDisplayVisual,
  getPercentChange,
  getPercentChangeClassName,
  getTrendColor,
} from '../../utils/salesByCategoryModalHelpers';
import { TREND_POSITIVE, TREND_NEGATIVE } from '../../constants/trendColors';
import type { SalesByCategoryItem } from '../SalesTrend/SalesByCategoryCard';

export type ViewMode = 'table' | 'visual';

export interface SalesByCategoryModalBodyProps {
  items: SalesByCategoryItem[];
  currentPeriodLabel: string;
  comparisonPeriodLabel: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  totalCurrent: number;
  totalComparison: number;
  totalPercentChange: number | null;
  maxValue: number;
}

export function SalesByCategoryModalBody({
  items,
  currentPeriodLabel,
  comparisonPeriodLabel,
  viewMode,
  onViewModeChange,
  totalCurrent,
  totalComparison,
  totalPercentChange,
  maxValue,
}: Readonly<SalesByCategoryModalBodyProps>) {
  return (
    <>
      <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex flex-col md:flex-row items-center justify-center md:justify-between flex-shrink-0 flex-wrap gap-2 z-0">
        <h2 id="sales-by-category-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white shrink-0">
          Net Sales by Category
        </h2>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <div className="flex rounded-lg overflow-hidden bg-white/20">
            <button
              type="button"
              onClick={() => onViewModeChange('table')}
              className={`px-2 py-1 text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-white text-primary' : 'text-white hover:bg-white/10'}`}
              aria-pressed={viewMode === 'table'}
              title="Table view"
            >
              Table
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('visual')}
              className={`px-2 py-1 text-xs font-medium transition-colors ${viewMode === 'visual' ? 'bg-white text-primary' : 'text-white hover:bg-white/10'}`}
              aria-pressed={viewMode === 'visual'}
              title="Visual chart view"
            >
              Visual
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col px-5 pt-4 overflow-hidden border-x border-gray-200">
        {viewMode === 'visual' && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-primary flex-shrink-0 pb-2 mb-4">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: TREND_POSITIVE }} aria-hidden />
              {currentPeriodLabel} (increase)
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: TREND_NEGATIVE }} aria-hidden />
              {currentPeriodLabel} (decrease)
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: COMPARISON_BAR_COLOR }} aria-hidden />
              {comparisonPeriodLabel}
            </span>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto md:[scrollbar-gutter:stable]">
          {viewMode === 'table' ? (
            <table className="w-full table-fixed border-collapse text-[10px] md:text-xs 2xl:text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[24%]" />
                <col className="w-[24%]" />
                <col className="w-[24%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-xs md:text-sm 2xl:text-base text-secondary border-b border-gray-200">
                  <th className="pb-3 pr-4 pl-2 font-semibold">Label</th>
                  <th className="pb-3 pr-4 font-semibold text-right">{currentPeriodLabel}</th>
                  <th className="pb-3 pr-4 font-semibold text-right">{comparisonPeriodLabel}</th>
                  <th className="pb-3 pr-2 font-semibold text-right">Percentage (%)</th>
                </tr>
              </thead>
              <tbody className="text-primary text-[10px] md:text-xs 2xl:text-sm">
                {items.map((item, index) => {
                  const percentChange = getPercentChange(item.currentValue, item.comparisonValue);
                  return (
                    <tr key={item.label} className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}>
                      <td className="py-3 pr-4 pl-2 font-medium text-secondary text-xs md:text-sm 2xl:text-base truncate" title={item.label}>
                        {item.label}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold">{formatCurrency(item.currentValue)}</td>
                      <td className="py-3 pr-4 text-right font-semibold">{formatCurrency(item.comparisonValue)}</td>
                      <td className="py-3 pr-2 text-right">
                        <span className={`font-semibold ${getPercentChangeClassName(percentChange)}`}>
                          {formatPercentDisplay(percentChange)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="space-y-3 pb-2">
              {items.map((item) => {
                const currentPercent = maxValue > 0 ? (item.currentValue / maxValue) * 100 : 0;
                const comparisonPercent = maxValue > 0 ? (item.comparisonValue / maxValue) * 100 : 0;
                const currentBarColor = getTrendColor(item.currentValue, item.comparisonValue);
                const percentChange = getPercentChange(item.currentValue, item.comparisonValue);
                return (
                  <div key={item.label} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                    <div className="mb-1 text-[10px] md:text-xs 2xl:text-sm font-medium text-secondary flex items-center gap-1.5">
                      <span>{item.label}</span>
                      <span className={`shrink-0 font-semibold ${getPercentChangeClassName(percentChange)}`}>
                        {formatPercentDisplayVisual(percentChange)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 rounded overflow-hidden bg-white" style={{ height: 8 }}>
                          <div
                            className="h-full rounded"
                            style={{
                              width: `${currentPercent}%`,
                              backgroundColor: currentBarColor,
                              minWidth: item.currentValue > 0 ? 2 : 0,
                            }}
                          />
                        </div>
                        <span className="text-[10px] md:text-xs 2xl:text-sm text-primary font-semibold shrink-0">
                          {formatCurrency(item.currentValue)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 rounded overflow-hidden bg-white" style={{ height: 8 }}>
                          <div
                            className="h-full rounded"
                            style={{
                              width: `${comparisonPercent}%`,
                              backgroundColor: COMPARISON_BAR_COLOR,
                              minWidth: item.comparisonValue > 0 ? 2 : 0,
                            }}
                          />
                        </div>
                        <span className="text-[10px] md:text-xs 2xl:text-sm text-primary font-semibold shrink-0">
                          {formatCurrency(item.comparisonValue)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className={`flex-shrink-0 border-t-2 border-gray-200 pt-4 pb-4 mt-2 ${viewMode === 'table' ? 'md:pr-[17px]' : ''}`}>
          {viewMode === 'table' ? (
            <table className="w-full table-fixed border-collapse text-[10px] md:text-xs 2xl:text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[24%]" />
                <col className="w-[24%]" />
                <col className="w-[24%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-xs md:text-sm 2xl:text-base text-secondary sr-only">
                  <th scope="col">Label</th>
                  <th scope="col" className="text-right">{currentPeriodLabel}</th>
                  <th scope="col" className="text-right">{comparisonPeriodLabel}</th>
                  <th scope="col" className="text-right">Percentage (%)</th>
                </tr>
              </thead>
              <tbody className="text-primary">
                <tr>
                  <td className="py-2 pr-4 pl-2 font-semibold text-secondary text-xs md:text-sm 2xl:text-base">Total</td>
                  <td className="py-2 pr-4 text-right font-semibold">{formatCurrency(totalCurrent)}</td>
                  <td className="py-2 pr-4 text-right font-semibold">{formatCurrency(totalComparison)}</td>
                  <td className="py-2 pr-2 text-right">
                    <span className={`font-semibold ${getPercentChangeClassName(totalPercentChange)}`}>
                      {formatPercentDisplay(totalPercentChange)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <>
              <div className="mb-1 text-[10px] md:text-xs 2xl:text-sm font-semibold text-secondary flex items-center gap-1.5">
                <span>Total</span>
                <span className={`shrink-0 font-semibold ${getPercentChangeClassName(totalPercentChange)}`}>
                  {formatPercentDisplayVisual(totalPercentChange)}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <TotalVisualBars
                  totalCurrent={totalCurrent}
                  totalComparison={totalComparison}
                  maxValue={maxValue}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function TotalVisualBars({
  totalCurrent,
  totalComparison,
  maxValue,
}: Readonly<{ totalCurrent: number; totalComparison: number; maxValue: number }>) {
  const totalCurrentPct = maxValue > 0 ? (totalCurrent / maxValue) * 100 : 0;
  const totalComparisonPct = maxValue > 0 ? (totalComparison / maxValue) * 100 : 0;
  return (
    <>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 rounded overflow-hidden bg-white" style={{ height: 8 }}>
          <div
            className="h-full rounded"
            style={{
              width: `${totalCurrentPct}%`,
              backgroundColor: getTrendColor(totalCurrent, totalComparison),
              minWidth: totalCurrent > 0 ? 2 : 0,
            }}
          />
        </div>
        <span className="text-[10px] md:text-xs 2xl:text-sm text-primary font-semibold shrink-0">
          {formatCurrency(totalCurrent)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 rounded overflow-hidden bg-white" style={{ height: 8 }}>
          <div
            className="h-full rounded"
            style={{
              width: `${totalComparisonPct}%`,
              backgroundColor: COMPARISON_BAR_COLOR,
              minWidth: totalComparison > 0 ? 2 : 0,
            }}
          />
        </div>
        <span className="text-[10px] md:text-xs 2xl:text-sm text-primary font-semibold shrink-0">
          {formatCurrency(totalComparison)}
        </span>
      </div>
    </>
  );
}

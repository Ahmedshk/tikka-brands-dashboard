import { useState } from 'react';
import { TREND_POSITIVE, TREND_NEGATIVE } from '../../constants/trendColors';
import { SalesByCategoryModal } from '../modal/SalesByCategoryModal';
import { PeriodPicker } from './PeriodPicker';
import { ComparisonPeriodPicker } from './ComparisonPeriodPicker';
import { Spinner } from '../common/Spinner';
import type { PeriodPickerValue } from './PeriodPicker';
import type { ComparisonPeriodPickerValue } from './ComparisonPeriodPicker';

const COMPARISON_BAR_COLOR = '#9CA3AF';
const CARD_TOP_N = 3;

type ViewMode = 'table' | 'visual';

const pickerClass =
  'border-0 rounded-lg px-2 py-1 text-xs font-medium text-primary bg-white focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer';

export interface SalesByCategoryItem {
  label: string;
  currentValue: number;
  comparisonValue: number;
}

export interface SalesByCategoryCardProps {
  items: SalesByCategoryItem[];
  currentPeriodLabel: string;
  comparisonPeriodLabel: string;
  /** Full list for totals row and View All modal; if not provided, items are used */
  allItems?: SalesByCategoryItem[];
  /** When true, show spinner in card body */
  loading?: boolean;
  periodValue?: PeriodPickerValue;
  comparisonValue?: ComparisonPeriodPickerValue;
  onPeriodChange?: (value: PeriodPickerValue) => void;
  onComparisonChange?: (value: ComparisonPeriodPickerValue) => void;
  excludeNoneFromComparison?: boolean;
  /** Formatted date range for current period (e.g. "02/22/26 – 02/27/26"); shown with legend */
  periodDateRange?: string;
  /** Formatted date range for comparison period; shown with legend when present */
  comparisonDateRange?: string;
}

function getTrendColor(currentValue: number, comparisonValue: number) {
  if (comparisonValue === 0) return TREND_POSITIVE;
  return currentValue >= comparisonValue ? TREND_POSITIVE : TREND_NEGATIVE;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** Returns null when comparison is 0 and current > 0 (undefined % change); otherwise the percentage. */
function getPercentChange(currentValue: number, comparisonValue: number): number | null {
  if (comparisonValue === 0) return currentValue > 0 ? null : 0;
  return ((currentValue - comparisonValue) / comparisonValue) * 100;
}

function formatPercentDisplay(percent: number | null): string {
  if (percent === null) return 'N/A';
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

/** For visual view only: show nothing when undefined (no N/A or —). */
function formatPercentDisplayVisual(percent: number | null): string {
  if (percent === null) return '';
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

export const SalesByCategoryCard = ({
  items,
  allItems,
  loading = false,
  currentPeriodLabel,
  comparisonPeriodLabel,
  periodValue,
  comparisonValue,
  onPeriodChange,
  onComparisonChange,
  excludeNoneFromComparison = false,
  periodDateRange,
  comparisonDateRange,
}: SalesByCategoryCardProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [modalOpen, setModalOpen] = useState(false);
  const displayItems = items.slice(0, CARD_TOP_N);
  const totalsSource = allItems ?? items;
  const totalCurrent = totalsSource.reduce((s, i) => s + i.currentValue, 0);
  const totalComparison = totalsSource.reduce((s, i) => s + i.comparisonValue, 0);
  const totalPercentChange = getPercentChange(totalCurrent, totalComparison);
  const cardMaxValue = Math.max(
    ...displayItems.flatMap((i) => [i.currentValue, i.comparisonValue]),
    totalCurrent,
    totalComparison,
    1
  );
  const usePickers =
    periodValue != null &&
    comparisonValue != null &&
    onPeriodChange != null &&
    onComparisonChange != null;

  return (
    <div className="flex flex-col h-full">
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex flex-col md:flex-row items-center justify-center md:justify-between flex-wrap gap-2">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white shrink-0">Net Sales by Category</h3>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {usePickers && (
            <>
              <PeriodPicker value={periodValue} onChange={onPeriodChange} className={pickerClass} />
              <span className="text-white text-xs font-medium shrink-0">vs</span>
              <ComparisonPeriodPicker
                value={comparisonValue}
                onChange={onComparisonChange}
                period={periodValue}
                excludeComparisonTypes={excludeNoneFromComparison ? ['none'] : undefined}
                className={pickerClass}
              />
            </>
          )}
          <div className="flex rounded-lg overflow-hidden bg-white/20">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-white text-primary' : 'text-white hover:bg-white/10'}`}
              aria-pressed={viewMode === 'table'}
            >
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('visual')}
              className={`px-2 py-1 text-xs font-medium transition-colors ${viewMode === 'visual' ? 'bg-white text-primary' : 'text-white hover:bg-white/10'}`}
              aria-pressed={viewMode === 'visual'}
            >
              Visual
            </button>
          </div>
        </div>
      </div>
      <div className="px-5 pb-4 flex-1 pt-5 space-y-4 flex flex-col min-h-0">
        {loading ? (
          <div className="flex-1 flex justify-center items-center w-full min-w-0">
            <Spinner size="lg" className="text-button-primary" />
          </div>
        ) : (
        <>
        {viewMode === 'visual' && (
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
                  <span className="block text-[10px] text-gray-500 font-normal">{comparisonDateRange}</span>
                )}
              </span>
            </span>
          </div>
        )}
        {viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
              <thead>
                <tr
                  className={`text-left text-xs md:text-sm 2xl:text-base text-secondary ${periodDateRange == null && comparisonDateRange == null ? 'border-b border-gray-200' : ''}`}
                >
                  <th className="pb-3 pr-4 pl-2 font-semibold">Label</th>
                  <th className="pb-3 pr-4 font-semibold text-right">{currentPeriodLabel}</th>
                  <th className="pb-3 pr-4 font-semibold text-right">{comparisonPeriodLabel}</th>
                  <th className="pb-3 pr-2 font-semibold text-right">Percentage (%)</th>
                </tr>
                {(periodDateRange != null || comparisonDateRange != null) && (
                  <tr className="text-left text-[8px] md:text-[10px] text-primary border-b border-gray-200">
                    <th className="pb-2 pr-4 pl-2 font-normal" />
                    <th className="pb-2 pr-4 font-normal text-right">
                      {periodDateRange ?? ''}
                    </th>
                    <th className="pb-2 pr-4 font-normal text-right">
                      {comparisonDateRange ?? ''}
                    </th>
                    <th className="pb-2 pr-2" />
                  </tr>
                )}
              </thead>
              <tbody className="text-primary text-[10px] md:text-xs 2xl:text-sm">
                {displayItems.map((item, index) => {
                  const percentChange = getPercentChange(item.currentValue, item.comparisonValue);
                  const isPositive = percentChange !== null && percentChange >= 0;
                  return (
                    <tr
                      key={item.label}
                      className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                    >
                      <td className="py-3 pr-4 pl-2 font-medium text-secondary text-xs md:text-sm 2xl:text-base">{item.label}</td>
                      <td className="py-3 pr-4 text-right font-semibold">{formatCurrency(item.currentValue)}</td>
                      <td className="py-3 pr-4 text-right font-semibold">{formatCurrency(item.comparisonValue)}</td>
                      <td className="py-3 pr-2 text-right">
                        <span
                          className={`font-semibold ${
                            percentChange === null ? 'text-secondary' : isPositive ? 'text-positive' : 'text-negative'
                          }`}
                        >
                          {formatPercentDisplay(percentChange)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-gray-200">
                  <td className="py-3 pr-4 pl-2 font-semibold text-secondary text-xs md:text-sm 2xl:text-base">Total</td>
                  <td className="py-3 pr-4 text-right font-semibold">{formatCurrency(totalCurrent)}</td>
                  <td className="py-3 pr-4 text-right font-semibold">{formatCurrency(totalComparison)}</td>
                  <td className="py-3 pr-2 text-right">
                    <span
                      className={`font-semibold ${
                        totalPercentChange === null ? 'text-secondary' : totalPercentChange >= 0 ? 'text-positive' : 'text-negative'
                      }`}
                    >
                      {formatPercentDisplay(totalPercentChange)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="space-y-3">
            {displayItems.map((item) => {
              const currentPercent = cardMaxValue > 0 ? (item.currentValue / cardMaxValue) * 100 : 0;
              const comparisonPercent = cardMaxValue > 0 ? (item.comparisonValue / cardMaxValue) * 100 : 0;
              const currentBarColor = getTrendColor(item.currentValue, item.comparisonValue);
              const percentChange = getPercentChange(item.currentValue, item.comparisonValue);
              const isPositive = percentChange !== null && percentChange >= 0;
              return (
                <div
                  key={item.label}
                  className="rounded-lg border border-gray-200 bg-gray-50/50 p-3"
                >
                  <div className="mb-1 text-[10px] md:text-xs 2xl:text-sm font-medium text-secondary flex items-center gap-1.5">
                    <span>{item.label}</span>
                    <span
                      className={`shrink-0 font-semibold ${
                        percentChange === null ? 'text-secondary' : isPositive ? 'text-positive' : 'text-negative'
                      }`}
                    >
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
            <div className="border-t-2 border-gray-200 pt-4 mt-4">
              <div className="mb-1 text-[10px] md:text-xs 2xl:text-sm font-semibold text-secondary flex items-center gap-1.5">
                <span>Total</span>
                <span
                  className={`shrink-0 font-semibold ${
                    totalPercentChange === null ? 'text-secondary' : totalPercentChange >= 0 ? 'text-positive' : 'text-negative'
                  }`}
                >
                  {formatPercentDisplayVisual(totalPercentChange)}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {(() => {
                  const totalCurrentPct = cardMaxValue > 0 ? (totalCurrent / cardMaxValue) * 100 : 0;
                  const totalComparisonPct = cardMaxValue > 0 ? (totalComparison / cardMaxValue) * 100 : 0;
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
                })()}
              </div>
            </div>
          </>
        )}
        </>
        )}
      </div>
      <div className="px-5 pb-5 flex justify-end">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="text-[10px] md:text-xs 2xl:text-sm font-bold text-quaternary hover:underline cursor-pointer"
        >
          View All
        </button>
      </div>

      <SalesByCategoryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        items={allItems ?? items}
        currentPeriodLabel={currentPeriodLabel}
        comparisonPeriodLabel={comparisonPeriodLabel}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
    </div>
  );
};

import { useEffect, useRef } from 'react';
import { TREND_POSITIVE, TREND_NEGATIVE } from '../../constants/trendColors';
import type { SalesByCategoryItem } from '../SalesTrend/SalesByCategoryCard';

const COMPARISON_BAR_COLOR = '#9CA3AF';

type ViewMode = 'table' | 'visual';

export interface SalesByCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: SalesByCategoryItem[];
  currentPeriodLabel: string;
  comparisonPeriodLabel: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
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

export const SalesByCategoryModal = ({
  isOpen,
  onClose,
  items,
  currentPeriodLabel,
  comparisonPeriodLabel,
  viewMode,
  onViewModeChange,
}: SalesByCategoryModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  const totalCurrent = items.reduce((s, i) => s + i.currentValue, 0);
  const totalComparison = items.reduce((s, i) => s + i.comparisonValue, 0);
  const totalPercentChange = getPercentChange(totalCurrent, totalComparison);
  const maxValue = Math.max(
    ...items.flatMap((i) => [i.currentValue, i.comparisonValue]),
    totalCurrent,
    totalComparison,
    1
  );

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[300] m-0 grid h-screen w-screen min-h-screen min-w-full max-w-none max-h-none place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="sales-by-category-modal-title"
      onClose={onClose}
    >
      <div className="relative w-full max-w-2xl">
        <button
          type="button"
          onClick={() => { dialogRef.current?.close(); onClose(); }}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex flex-col md:flex-row items-center justify-center md:justify-between flex-shrink-0 flex-wrap gap-2 z-0">
            <h2 id="sales-by-category-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white shrink-0">Net Sales by Category</h2>
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
                  {currentPeriodLabel}
                  {' '}
                  (increase)
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: TREND_NEGATIVE }} aria-hidden />
                  {currentPeriodLabel}
                  {' '}
                  (decrease)
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
                      const isPositive = percentChange !== null && percentChange >= 0;
                      return (
                        <tr key={item.label} className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}>
                          <td className="py-3 pr-4 pl-2 font-medium text-secondary text-xs md:text-sm 2xl:text-base truncate" title={item.label}>{item.label}</td>
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
                  </tbody>
                </table>
              ) : (
                <div className="space-y-3 pb-2">
                  {items.map((item) => {
                    const currentPercent = maxValue > 0 ? (item.currentValue / maxValue) * 100 : 0;
                    const comparisonPercent = maxValue > 0 ? (item.comparisonValue / maxValue) * 100 : 0;
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
                            <span className="text-[10px] md:text-xs 2xl:text-sm text-primary font-semibold shrink-0">{formatCurrency(item.currentValue)}</span>
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
                            <span className="text-[10px] md:text-xs 2xl:text-sm text-primary font-semibold shrink-0">{formatCurrency(item.comparisonValue)}</span>
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
              ) : (
                <>
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
                            <span className="text-[10px] md:text-xs 2xl:text-sm text-primary font-semibold shrink-0">{formatCurrency(totalCurrent)}</span>
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
                            <span className="text-[10px] md:text-xs 2xl:text-sm text-primary font-semibold shrink-0">{formatCurrency(totalComparison)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
};

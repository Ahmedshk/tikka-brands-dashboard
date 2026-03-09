import { useState } from 'react';
import { SalesByCategoryModal } from '../modal/SalesByCategoryModal';
import { PeriodPicker } from './PeriodPicker';
import { ComparisonPeriodPicker } from './ComparisonPeriodPicker';
import { Spinner } from '../common/Spinner';
import { SalesByCategoryCardTable } from './SalesByCategoryCardTable';
import { SalesByCategoryCardVisual } from './SalesByCategoryCardVisual';
import {
  CARD_TOP_N,
  pickerClass,
  getPercentChange,
} from '../../utils/salesByCategoryCardHelpers';
import type { PeriodPickerValue } from './PeriodPicker';
import type { ComparisonPeriodPickerValue } from './ComparisonPeriodPicker';

type ViewMode = 'table' | 'visual';

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
}: Readonly<SalesByCategoryCardProps>) => {
  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [modalOpen, setModalOpen] = useState(false);

  const displayItems = items.slice(0, CARD_TOP_N);
  const totalsSource = allItems ?? items;
  const totalCurrent = totalsSource.reduce((s, i) => s + i.currentValue, 0);
  const totalComparison = totalsSource.reduce((s, i) => s + i.comparisonValue, 0);
  const totalPercentChange = getPercentChange(totalCurrent, totalComparison);

  const usePickers =
    periodValue != null &&
    comparisonValue != null &&
    onPeriodChange != null &&
    onComparisonChange != null;

  const viewModeIsTable = viewMode === 'table';

  return (
    <div className="flex flex-col h-full">
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex flex-col md:flex-row items-center justify-center md:justify-between flex-wrap gap-2">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white shrink-0">
          Net Sales by Category
        </h3>
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
              className={`px-2 py-1 text-xs font-medium transition-colors ${viewModeIsTable ? 'bg-white text-primary' : 'text-white hover:bg-white/10'}`}
              aria-pressed={viewModeIsTable}
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
            {viewModeIsTable ? (
              <SalesByCategoryCardTable
                displayItems={displayItems}
                totalCurrent={totalCurrent}
                totalComparison={totalComparison}
                totalPercentChange={totalPercentChange}
                currentPeriodLabel={currentPeriodLabel}
                comparisonPeriodLabel={comparisonPeriodLabel}
                periodDateRange={periodDateRange}
                comparisonDateRange={comparisonDateRange}
              />
            ) : (
              <SalesByCategoryCardVisual
                displayItems={displayItems}
                totalCurrent={totalCurrent}
                totalComparison={totalComparison}
                totalPercentChange={totalPercentChange}
                currentPeriodLabel={currentPeriodLabel}
                comparisonPeriodLabel={comparisonPeriodLabel}
                periodDateRange={periodDateRange}
                comparisonDateRange={comparisonDateRange}
              />
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

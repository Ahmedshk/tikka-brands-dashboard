import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getPercentChange } from '../../utils/salesByCategoryModalHelpers';
import type { SalesByCategoryItem } from '../SalesTrend/SalesByCategoryCard';
import { SalesByCategoryModalBody, type ViewMode } from './SalesByCategoryModalBody';

export type { ViewMode } from './SalesByCategoryModalBody';

export interface SalesByCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: SalesByCategoryItem[];
  currentPeriodLabel: string;
  comparisonPeriodLabel: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
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

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="sales-by-category-modal-title"
      onClose={onClose}
    >
      <div className="relative w-full max-w-2xl">
        <button
          type="button"
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <SalesByCategoryModalBody
            items={items}
            currentPeriodLabel={currentPeriodLabel}
            comparisonPeriodLabel={comparisonPeriodLabel}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            totalCurrent={totalCurrent}
            totalComparison={totalComparison}
            totalPercentChange={totalPercentChange}
            maxValue={maxValue}
          />
        </div>
      </div>
    </dialog>,
    document.body
  );
};

export interface KPIsTableRow {
  label: string;
  current: string | number;
  previous: string | number;
  /** Percent change; null when comparison is 0 and current > 0 (show N/A). */
  percent: number | null;
  /** Formula description for tooltip (e.g. "Total Net Sales / Total Transactions") */
  tooltip?: string;
}

import type { ComparisonPeriodPickerValue } from './ComparisonPeriodPicker';
import type { PeriodPickerValue } from './PeriodPicker';
import { ComparisonPeriodPicker } from './ComparisonPeriodPicker';
import { PeriodPicker } from './PeriodPicker';

export interface KPIsTableCardProps {
  rows: KPIsTableRow[];
  title?: string;
  currentPeriodLabel?: string;
  comparisonPeriodLabel?: string;
  /** Date range for current period (e.g. "Feb 22 – Feb 28, 2026" or "Feb 22, 2026"); shown under column header when set */
  currentPeriodDateRange?: string;
  /** Date range for comparison period; shown under column header when set */
  comparisonPeriodDateRange?: string;
  /** Full period value for PeriodPicker (enables calendar for custom range) */
  periodValue?: PeriodPickerValue;
  /** Full comparison value for ComparisonPeriodPicker (enables calendar for custom) */
  comparisonValue?: ComparisonPeriodPickerValue;
  onPeriodChange?: (value: PeriodPickerValue) => void;
  onComparisonChange?: (value: ComparisonPeriodPickerValue) => void;
  /** When true, "None" is excluded from comparison options (e.g. for KPI table) */
  excludeNoneFromComparison?: boolean;
  /** When true, show spinner in card body instead of table */
  loading?: boolean;
}

import { useState, useRef, useEffect } from 'react';
import Tooltip from '@mui/material/Tooltip';
import { BsFillInfoCircleFill } from 'react-icons/bs';
import { Spinner } from '../common/Spinner';

function formatCell(value: string | number): string {
  return typeof value === 'number'
    ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value;
}

function getPercentColorClass(percent: number | null): string {
  if (percent === null) return 'text-secondary';
  return percent >= 0 ? 'text-positive' : 'text-negative';
}

function formatPercentDisplay(percent: number | null): string {
  if (percent === null) return 'N/A';
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent}%`;
}

const pickerClass =
  'border-0 rounded-lg px-2 py-1 text-xs font-medium text-primary bg-white focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer';

function LabelWithOptionalTooltip({ row }: Readonly<{ row: KPIsTableRow }>) {
  const formula = row.tooltip;
  const [hoverOpen, setHoverOpen] = useState(false);
  const [clickOpen, setClickOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!clickOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (buttonRef.current && !buttonRef.current.contains(target)) {
        setClickOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [clickOpen]);

  const labelSpan = (
    <span className="font-medium text-secondary text-xs md:text-sm 2xl:text-base">{row.label}</span>
  );
  if (formula) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Tooltip title={formula} placement="top" arrow open={hoverOpen || clickOpen}>
          <button
            ref={buttonRef}
            type="button"
            className="inline-flex shrink-0 cursor-pointer text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-0 rounded-full p-0 border-0 bg-transparent"
            aria-label={`Info: ${formula}`}
            onMouseEnter={() => setHoverOpen(true)}
            onMouseLeave={() => setHoverOpen(false)}
            onClick={() => setClickOpen((prev) => !prev)}
          >
            <BsFillInfoCircleFill className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
        </Tooltip>
        {labelSpan}
      </span>
    );
  }
  return labelSpan;
}

function RowLabelCell({ row }: Readonly<{ row: KPIsTableRow }>) {
  return (
    <td className="py-3 pr-4 pl-2 text-xs md:text-sm 2xl:text-base">
      <LabelWithOptionalTooltip row={row} />
    </td>
  );
}

export const KPIsTableCard = ({
  rows,
  title = 'KPIs',
  currentPeriodLabel = 'Last 30 Days',
  comparisonPeriodLabel = 'Last Year',
  currentPeriodDateRange,
  comparisonPeriodDateRange,
  periodValue,
  comparisonValue,
  onPeriodChange,
  onComparisonChange,
  excludeNoneFromComparison = false,
  loading = false,
}: KPIsTableCardProps) => {
  const usePickers =
    periodValue != null &&
    comparisonValue != null &&
    onPeriodChange != null &&
    onComparisonChange != null;

  return (
    <div className="flex flex-col h-full">
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex flex-col md:flex-row items-center justify-center md:justify-between flex-wrap gap-2">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white shrink-0">{title}</h3>
        {usePickers && (
          <div className="flex items-center gap-2 flex-wrap md:ml-auto justify-center">
            <PeriodPicker value={periodValue} onChange={onPeriodChange} className={pickerClass} />
            <span className="text-white text-xs font-medium shrink-0">vs</span>
            <ComparisonPeriodPicker
              value={comparisonValue}
              onChange={onComparisonChange}
              period={periodValue}
              excludeComparisonTypes={excludeNoneFromComparison ? ['none'] : undefined}
              className={pickerClass}
            />
          </div>
        )}
      </div>
      <div className="px-5 pb-5 flex-1 overflow-x-auto pt-5 flex flex-col">
        {loading ? (
          <div className="flex flex-1 justify-center items-center min-h-[200px] w-full min-w-0">
            <Spinner size="lg" className="text-button-primary" />
          </div>
        ) : (
          <>
            {/* Mobile: card per row (like location-management) */}
            <div className="md:hidden divide-y divide-gray-200">
              {rows.map((row, index) => {
                const cardBg = index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
                return (
                  <div
                    key={`${row.label}-${index}`}
                    className={`${cardBg} px-4 py-4 sm:px-5 sm:py-4 flex flex-col gap-2`}
                  >
                    <p className="text-sm font-medium text-primary flex items-center gap-1.5 min-w-0">
                      <LabelWithOptionalTooltip row={row} />
                    </p>
                    <div className="flex flex-col gap-1 text-xs text-secondary">
                      <p className="flex justify-between items-baseline gap-2">
                        <span>
                          {currentPeriodLabel}
                          {currentPeriodDateRange && (
                            <span className="block text-[10px] text-gray-500 font-normal">
                              {currentPeriodDateRange}
                            </span>
                          )}
                        </span>
                        <span className="font-semibold text-primary shrink-0">{formatCell(row.current)}</span>
                      </p>
                      <p className="flex justify-between items-baseline gap-2">
                        <span>
                          {comparisonPeriodLabel}
                          {comparisonPeriodDateRange && (
                            <span className="block text-[10px] text-gray-500 font-normal">
                              {comparisonPeriodDateRange}
                            </span>
                          )}
                        </span>
                        <span className="font-semibold text-primary shrink-0">{formatCell(row.previous)}</span>
                      </p>
                      <p className="flex justify-between items-baseline gap-2 pt-0.5">
                        <span>Change</span>
                        <span
                          className={`font-semibold shrink-0 ${getPercentColorClass(row.percent)}`}
                        >
                          {formatPercentDisplay(row.percent)}
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
                <thead>
                  <tr className="text-left text-xs md:text-sm 2xl:text-base text-secondary">
                    <th className="pb-3 pr-4 pl-2 font-semibold" />
                    <th className="pb-3 pr-4 font-semibold text-right">{currentPeriodLabel}</th>
                    <th className="pb-3 pr-4 font-semibold text-right">{comparisonPeriodLabel}</th>
                    <th className="pb-3 pr-2 font-semibold text-right">Percentage (%)</th>
                  </tr>
                  {(currentPeriodDateRange != null || comparisonPeriodDateRange != null) && (
                    <tr className="text-left text-[8px] md:text-[10px] text-primary border-b border-gray-200">
                      <th className="pb-2 pr-4 pl-2 font-normal" />
                      <th className="pb-2 pr-4 font-normal text-right">
                        {currentPeriodDateRange ?? ''}
                      </th>
                      <th className="pb-2 pr-4 font-normal text-right">
                        {comparisonPeriodDateRange ?? ''}
                      </th>
                      <th className="pb-2 pr-2" />
                    </tr>
                  )}
                </thead>
                <tbody className="text-primary text-[10px] md:text-xs 2xl:text-sm">
                  {rows.map((row, index) => (
                    <tr
                      key={`${row.label}-${index}`}
                      className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                    >
                      <RowLabelCell row={row} />
                      <td className="py-3 pr-4 text-right font-semibold">{formatCell(row.current)}</td>
                      <td className="py-3 pr-4 text-right font-semibold">{formatCell(row.previous)}</td>
                      <td className="py-3 pr-2 text-right">
                        <span
                          className={`font-semibold ${getPercentColorClass(row.percent)}`}
                        >
                          {formatPercentDisplay(row.percent)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

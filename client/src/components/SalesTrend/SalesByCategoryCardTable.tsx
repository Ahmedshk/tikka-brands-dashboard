import type { SalesByCategoryItem } from './SalesByCategoryCard';
import {
  formatCurrency,
  formatPercentDisplay,
  getPercentChange,
  getPercentColorClass,
} from '../../utils/salesByCategoryCardHelpers';

export interface SalesByCategoryCardTableProps {
  displayItems: SalesByCategoryItem[];
  totalCurrent: number;
  totalComparison: number;
  totalPercentChange: number | null;
  currentPeriodLabel: string;
  comparisonPeriodLabel: string;
  periodDateRange?: string;
  comparisonDateRange?: string;
}

export function SalesByCategoryCardTable({
  displayItems,
  totalCurrent,
  totalComparison,
  totalPercentChange,
  currentPeriodLabel,
  comparisonPeriodLabel,
  periodDateRange,
  comparisonDateRange,
}: Readonly<SalesByCategoryCardTableProps>) {
  const showDateRow = periodDateRange != null || comparisonDateRange != null;
  const borderClass =
    periodDateRange == null && comparisonDateRange == null ? 'border-b border-gray-200' : '';

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
        <thead>
          <tr className={`text-left text-xs md:text-sm 2xl:text-base text-secondary ${borderClass}`}>
            <th className="pb-3 pr-4 pl-2 font-semibold">Label</th>
            <th className="pb-3 pr-4 font-semibold text-right">{currentPeriodLabel}</th>
            <th className="pb-3 pr-4 font-semibold text-right">{comparisonPeriodLabel}</th>
            <th className="pb-3 pr-2 font-semibold text-right">Percentage (%)</th>
          </tr>
          {showDateRow && (
            <tr className="text-left text-[8px] md:text-[10px] text-primary border-b border-gray-200">
              <th className="pb-2 pr-4 pl-2 font-normal" />
              <th className="pb-2 pr-4 font-normal text-right">{periodDateRange ?? ''}</th>
              <th className="pb-2 pr-4 font-normal text-right">{comparisonDateRange ?? ''}</th>
              <th className="pb-2 pr-2" />
            </tr>
          )}
        </thead>
        <tbody className="text-primary text-[10px] md:text-xs 2xl:text-sm">
          {displayItems.map((item, index) => {
            const percentChange = getPercentChange(item.currentValue, item.comparisonValue);
            return (
              <tr key={item.label} className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}>
                <td className="py-3 pr-4 pl-2 font-medium text-secondary text-xs md:text-sm 2xl:text-base">
                  {item.label}
                </td>
                <td className="py-3 pr-4 text-right font-semibold">
                  {formatCurrency(item.currentValue)}
                </td>
                <td className="py-3 pr-4 text-right font-semibold">
                  {formatCurrency(item.comparisonValue)}
                </td>
                <td className="py-3 pr-2 text-right">
                  <span className={`font-semibold ${getPercentColorClass(percentChange)}`}>
                    {formatPercentDisplay(percentChange)}
                  </span>
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-gray-200">
            <td className="py-3 pr-4 pl-2 font-semibold text-secondary text-xs md:text-sm 2xl:text-base">
              Total
            </td>
            <td className="py-3 pr-4 text-right font-semibold">{formatCurrency(totalCurrent)}</td>
            <td className="py-3 pr-4 text-right font-semibold">
              {formatCurrency(totalComparison)}
            </td>
            <td className="py-3 pr-2 text-right">
              <span className={`font-semibold ${getPercentColorClass(totalPercentChange)}`}>
                {formatPercentDisplay(totalPercentChange)}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

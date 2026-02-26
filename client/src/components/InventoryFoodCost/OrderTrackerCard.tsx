import type { OrderTrackerOrder } from '../../services/inventory.service';
import type { OrderTrackerPeriodValue } from './OrderTrackerPeriodPicker';
import { OrderTrackerPeriodPicker } from './OrderTrackerPeriodPicker';
import { Spinner } from '../common/Spinner';
import ViewIcon from '@assets/icons/view.svg?react';

const cardClass =
  'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

export interface OrderTrackerCardProps {
  /** Period value for the picker */
  timePeriod: OrderTrackerPeriodValue;
  /** Called when period changes */
  onPeriodChange: (value: OrderTrackerPeriodValue) => void;
  /** Rows to display in the card (e.g. first 12) */
  rows: OrderTrackerOrder[];
  /** Optional className for the card wrapper */
  className?: string;
  /** Show loading spinner in the table area */
  loading?: boolean;
  /** Called when "View All" is clicked */
  onViewAll: () => void;
  /** Called when View action is clicked for a row */
  onView: (order: OrderTrackerOrder) => void;
}

function statusStyle(status: string): { bg: string; dot: string } {
  const s = status.toLowerCase();
  if (s === 'received' || s.includes('received')) {
    return { bg: 'bg-[rgba(93,197,79,0.2)]', dot: '#5DC54F' };
  }
  return { bg: 'bg-[rgba(253,185,14,0.2)]', dot: '#FBC52A' };
}

export const OrderTrackerCard = ({
  timePeriod,
  onPeriodChange,
  rows,
  className = '',
  loading = false,
  onViewAll,
  onView,
}: OrderTrackerCardProps) => {
  return (
    <div
      className={`${cardClass} flex flex-col min-h-0 overflow-hidden ${className}`}
    >
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
          Order Tracker
        </h3>
        <OrderTrackerPeriodPicker value={timePeriod} onChange={onPeriodChange} />
      </div>
      <div className="p-5 flex-1 flex flex-col min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center min-h-[200px]">
            <Spinner size="lg" className="text-button-primary" />
          </div>
        ) : (
          <>
            <div className="overflow-auto flex-1 min-h-0">
              {/* Mobile: card list */}
              <div className="md:hidden divide-y divide-gray-200">
                {rows.map((row, index) => {
                  const style = statusStyle(row.status);
                  const cardBg = index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
                  return (
                    <div
                      key={`${row.poNumber}-${row.supplier}-${row.deliveryDate}-${index}`}
                      className={`${cardBg} px-4 py-4 sm:px-5 sm:py-4 flex flex-col gap-3`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-primary truncate">
                          PO# {row.poNumber}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          <span className="font-medium">Supplier:</span>{' '}
                          <span className="truncate">{row.supplier}</span>
                        </p>
                        <p className="text-xs text-gray-600">
                          <span className="font-medium">Delivery date:</span>{' '}
                          {row.deliveryDate}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${style.bg}`}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: style.dot }}
                              aria-hidden
                            />
                            {row.status}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => onView(row)}
                          className="p-2.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer touch-manipulation text-primary"
                          aria-label="View order"
                          title="View order"
                        >
                          <ViewIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Desktop: table */}
              <div className="hidden md:block">
                <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
                  <thead>
                    <tr className="text-left text-secondary border-b border-gray-200">
                      <th className="pb-3 pr-4 pl-2 font-semibold">PO#</th>
                      <th className="pb-3 pr-4 font-semibold">Supplier</th>
                      <th className="pb-3 pr-4 font-semibold text-center">
                        Delivery date
                      </th>
                      <th className="pb-3 pr-4 font-semibold text-center">Status</th>
                      <th className="pb-3 pr-2 font-semibold text-center">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-primary">
                    {rows.map((row, index) => {
                      const style = statusStyle(row.status);
                      return (
                        <tr
                          key={`${row.poNumber}-${row.supplier}-${row.deliveryDate}-${index}`}
                          className={
                            index % 2 === 1 ? 'bg-[#F3F5F7]' : ''
                          }
                        >
                          <td className="py-3 pr-4 pl-2">{row.poNumber}</td>
                          <td className="py-3 pr-4">{row.supplier}</td>
                          <td className="py-3 pr-4 text-center">
                            {row.deliveryDate}
                          </td>
                          <td className="py-3 pr-4 text-center">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${style.bg}`}
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: style.dot }}
                                aria-hidden
                              />
                              {row.status}
                            </span>
                          </td>
                          <td className="py-3 pr-2 text-center">
                            <button
                              type="button"
                              onClick={() => onView(row)}
                              className="p-1 text-primary hover:bg-gray-200 rounded transition-colors"
                              aria-label="View"
                              title="View order"
                            >
                              <ViewIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-end pt-3 flex-shrink-0">
              <button
                type="button"
                onClick={onViewAll}
                className="text-[10px] md:text-xs 2xl:text-sm font-bold text-quaternary hover:underline cursor-pointer"
                title="View all orders"
              >
                View All
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

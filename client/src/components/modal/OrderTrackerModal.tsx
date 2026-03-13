import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pagination } from '../common/Pagination';
import type { OrderTrackerOrder } from '../../services/inventory.service';
import ViewIcon from '@assets/icons/view.svg?react';
import CommentIcon from '@assets/icons/comment.svg?react';

const PAGE_SIZE = 12;

function statusStyle(status: string): { bg: string; dot: string } {
  const s = status.toLowerCase();
  if (s === 'received' || s.includes('received')) {
    return { bg: 'bg-[rgba(34,197,94,0.2)]', dot: '#5DC54F' };
  }
  return { bg: 'bg-[rgba(245,158,11,0.2)]', dot: '#FBC52A' };
}

export interface OrderTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: OrderTrackerOrder[];
  onView: (order: OrderTrackerOrder) => void;
}

export const OrderTrackerModal = ({
  isOpen,
  onClose,
  rows,
  onView,
}: OrderTrackerModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(1);

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
      setPage(1);
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  const totalPages = Math.ceil(rows.length / PAGE_SIZE) || 1;
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="order-tracker-modal-title"
      onClose={onClose}
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-4xl">
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
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2
              id="order-tracker-modal-title"
              className="text-sm md:text-base 2xl:text-lg font-semibold text-white"
            >
              Order Tracker
            </h2>
          </div>
          <div className="flex-1 min-h-0 min-w-0 flex flex-col px-5 pt-4 overflow-hidden border-x border-gray-200">
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-auto md:[scrollbar-gutter:stable]">
              {/* Mobile: card list */}
              <div className="md:hidden divide-y divide-gray-200">
                {pageRows.map((row, index) => {
                  const style = statusStyle(row.status);
                  const cardBg = (start + index) % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
                  return (
                    <div
                      key={`${row.poNumber}-${row.supplier}-${row.deliveryDate}-${start + index}`}
                      className={`${cardBg} px-4 py-4 sm:px-5 sm:py-4 flex flex-col gap-3`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-primary truncate">
                          PO# {row.poNumber}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1.5 min-w-0">
                          <span className="font-medium shrink-0">Supplier:</span>{' '}
                          <span className="truncate">{row.supplier}</span>
                          {row.orderDetails?.Comments?.trim() && (
                            <CommentIcon
                              className="w-4 h-4 shrink-0 text-amber-500"
                              aria-label="Order has a comment"
                              title="Order has a comment"
                            />
                          )}
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
              <div className="hidden md:block min-w-0">
                <table className="w-full min-w-[400px] border-collapse text-[10px] md:text-xs 2xl:text-sm">
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
                    {pageRows.map((row, index) => {
                      const style = statusStyle(row.status);
                      return (
                        <tr
                          key={`${row.poNumber}-${row.supplier}-${row.deliveryDate}-${start + index}`}
                          className={
                            (start + index) % 2 === 1 ? 'bg-[#F3F5F7]' : ''
                          }
                        >
                          <td className="py-3 pr-4 pl-2">{row.poNumber}</td>
                          <td className="py-3 pr-4">
                            <span className="inline-flex items-center gap-1.5">
                              {row.supplier}
                              {row.orderDetails?.Comments?.trim() && (
                                <CommentIcon
                                  className="w-4 h-4 shrink-0 text-amber-500"
                                  aria-label="Order has a comment"
                                  title="Order has a comment"
                                />
                              )}
                            </span>
                          </td>
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
            {totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={rows.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            )}
          </div>
        </div>
      </div>
    </dialog>,
    document.body
  );
};

import { useEffect, useRef } from 'react';
import type { OrderTrackerOrder } from '../../services/inventory.service';

function formatCurrency(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderTrackerOrder | null;
}

export const OrderDetailModal = ({
  isOpen,
  onClose,
  order,
}: OrderDetailModalProps) => {
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

  if (!isOpen) return null;

  const details = order?.orderDetails;
  const items = details?.Items ?? [];

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[310] m-0 grid h-screen w-screen min-h-screen min-w-full max-w-none max-h-none place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="order-detail-modal-title"
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
              id="order-detail-modal-title"
              className="text-sm md:text-base 2xl:text-lg font-semibold text-white"
            >
              Order details
            </h2>
          </div>
          <div className="flex-1 min-h-0 min-w-0 flex flex-col px-5 py-4 overflow-hidden border-x border-gray-200">
            {order ? (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] md:text-xs 2xl:text-sm text-primary mb-4 flex-shrink-0">
                  <span className="text-secondary">PO#</span>
                  <span>{order.poNumber}</span>
                  <span className="text-secondary">Supplier</span>
                  <span>{order.supplier}</span>
                  <span className="text-secondary">Delivery date</span>
                  <span>{order.deliveryDate}</span>
                  <span className="text-secondary">Sent date</span>
                  <span>{order.sentDate || '—'}</span>
                  <span className="text-secondary">Status</span>
                  <span>{order.status}</span>
                  {(details?.PriceTotalWithoutVAT != null ||
                    details?.PriceTotalWithVAT != null) && (
                    <>
                      <span className="text-secondary">Total</span>
                      <span>
                        {details.PriceTotalWithoutVAT != null
                          ? formatCurrency(details.PriceTotalWithoutVAT)
                          : details.PriceTotalWithVAT != null
                            ? formatCurrency(details.PriceTotalWithVAT)
                            : '—'}
                      </span>
                    </>
                  )}
                </div>
                {details?.Comments?.trim() && (
                  <p className="text-[10px] md:text-xs 2xl:text-sm text-primary mb-4 flex-shrink-0">
                    <span className="text-secondary">Comments: </span>
                    {details.Comments.trim()}
                  </p>
                )}
                <div className="flex-1 min-h-0 overflow-auto">
                  {/* Mobile: item cards */}
                  <div className="md:hidden divide-y divide-gray-200">
                    {items.length === 0 ? (
                      <p className="py-4 text-center text-secondary text-xs">
                        No line items
                      </p>
                    ) : (
                      items.map((item, index) => {
                        const cardBg = index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
                        const packQtyStr =
                          item.PackQuantity != null
                            ? String(item.PackQuantity) +
                              (item.ItemMeasureTypeName?.trim()
                                ? ` ${item.ItemMeasureTypeName.trim()}`
                                : '')
                            : '—';
                        return (
                          <div
                            key={`${item.SKU ?? index}-${index}`}
                            className={`${cardBg} px-4 py-4 sm:px-5 sm:py-4 flex flex-col gap-2`}
                          >
                            <p className="text-sm font-medium text-primary truncate">
                              {item.ItemName ?? '—'}
                            </p>
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">SKU:</span>{' '}
                              {item.SKU ?? '—'}
                            </p>
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">Pack Qty:</span>{' '}
                              {packQtyStr}
                            </p>
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">Packs Per Case:</span>{' '}
                              {item.PacksPerCase != null
                                ? String(item.PacksPerCase)
                                : '—'}
                            </p>
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">Quantity:</span>{' '}
                              {item.Quantity != null ? String(item.Quantity) : '—'}
                            </p>
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">Price:</span>{' '}
                              {item.Price != null
                                ? formatCurrency(item.Price)
                                : '—'}
                            </p>
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">Price Total:</span>{' '}
                              {item.PriceTotal != null
                                ? formatCurrency(item.PriceTotal)
                                : '—'}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {/* Desktop: table */}
                  <div className="hidden md:block">
                    <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
                      <thead>
                        <tr className="text-left text-secondary border-b border-gray-200">
                          <th className="pb-2 pr-3 pl-0 font-semibold">Item Name</th>
                          <th className="pb-2 pr-3 font-semibold">SKU</th>
                          <th className="pb-2 pr-3 font-semibold text-right">
                            Pack Qty
                          </th>
                          <th className="pb-2 pr-3 font-semibold text-right">
                            Packs Per Case
                          </th>
                          <th className="pb-2 pr-3 font-semibold text-right">
                            Quantity
                          </th>
                          <th className="pb-2 pr-3 font-semibold text-right">
                            Price
                          </th>
                          <th className="pb-2 pr-0 font-semibold text-right">
                            Price Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="text-primary">
                        {items.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="py-4 text-center text-secondary"
                            >
                              No line items
                            </td>
                          </tr>
                        ) : (
                          items.map((item, index) => (
                            <tr
                              key={`${item.SKU ?? index}-${index}`}
                              className={
                                index % 2 === 1 ? 'bg-[#F3F5F7]' : ''
                              }
                            >
                              <td className="py-2 pr-3 pl-0">
                                {item.ItemName ?? '—'}
                              </td>
                              <td className="py-2 pr-3">{item.SKU ?? '—'}</td>
                              <td className="py-2 pr-3 text-right">
                                {item.PackQuantity != null
                                  ? String(item.PackQuantity) +
                                    (item.ItemMeasureTypeName?.trim()
                                      ? ` ${item.ItemMeasureTypeName.trim()}`
                                      : '')
                                  : '—'}
                              </td>
                              <td className="py-2 pr-3 text-right">
                                {item.PacksPerCase != null
                                  ? String(item.PacksPerCase)
                                  : '—'}
                              </td>
                              <td className="py-2 pr-3 text-right">
                                {item.Quantity != null
                                  ? String(item.Quantity)
                                  : '—'}
                              </td>
                              <td className="py-2 pr-3 text-right">
                                {item.Price != null
                                  ? formatCurrency(item.Price)
                                  : '—'}
                              </td>
                              <td className="py-2 pr-0 text-right">
                                {item.PriceTotal != null
                                  ? formatCurrency(item.PriceTotal)
                                  : '—'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-secondary">No order selected.</p>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
};

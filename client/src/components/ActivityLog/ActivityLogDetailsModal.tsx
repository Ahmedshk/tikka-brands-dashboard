import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ActivityLogDetailItem, ActivityLogRow } from "../../types/activityLog.types";
import { formatReadableDateTime } from "../../utils/dateTimeDisplayHelpers";
import { getActivityLogNoteDisplayText } from "../../utils/activityLogNotesHelpers";

interface ActivityLogDetailsModalProps {
  open: boolean;
  row: ActivityLogRow | null;
  displayTimezone: string;
  onClose: () => void;
}

/** Line items + modifiers (same layout for refund and discount details). */
function ReceiptLineItemsList({
  items,
  rightColumnLabel,
}: Readonly<{ items: ActivityLogDetailItem[]; rightColumnLabel: string }>) {
  if (items.length === 0) {
    return <p className="text-secondary text-sm">No items found.</p>;
  }

  return (
    <div className="rounded-xl border border-gray-200/90 overflow-hidden shadow-sm">
      <div className="flex items-baseline justify-between gap-3 px-3 py-2.5 border-b border-gray-200/80 bg-white/70 backdrop-blur-[2px]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary">
          Description
        </span>
        <div className="text-right">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary">
            {rightColumnLabel}
          </span>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {items.map((item, index) => (
          <article
            key={`${item.name}-${index}`}
            className="rounded-lg border border-gray-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] overflow-hidden"
          >
            <div className="px-3 pt-3 pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[13px] sm:text-sm font-semibold text-primary leading-snug">
                    {item.name}
                  </p>
                  {item.detailLine && (
                    <p className="text-xs text-secondary tabular-nums">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-secondary/70 mr-1.5">
                        Unit
                      </span>
                      {item.detailLine}
                    </p>
                  )}
                  {item.subtitle && (
                    <p className="text-xs text-secondary/85 pl-0 border-l-2 border-amber-400/60 pl-2 py-0.5 rounded-r">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary mr-1">
                        Variation
                      </span>
                      {item.subtitle}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-primary tabular-nums">{item.amount}</p>
                </div>
              </div>
            </div>

            {(item.addons?.length ?? 0) > 0 && (
              <div className="border-t border-gray-100 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-2">
                  Modifiers & add-ons
                </p>
                <ul className="space-y-2.5">
                  {(item.addons ?? []).map((addon, addonIndex) => (
                    <li
                      key={`${addon.name}-${addonIndex}`}
                      className="flex items-start justify-between gap-3 pl-2 border-l-2 border-slate-300/80"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-700">{addon.name}</p>
                        {addon.detailLine && (
                          <p className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                            <span className="text-[10px] text-slate-400 mr-1">Each</span>
                            {addon.detailLine}
                          </p>
                        )}
                      </div>
                      <p className="text-xs font-medium text-slate-600 tabular-nums shrink-0">
                        {addon.amount}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function TotalsSection({
  details,
  variant,
}: Readonly<{
  details: ActivityLogRow["details"] | undefined;
  variant: "refund" | "discount";
}>) {
  const title = variant === "refund" ? "Refund totals" : "Payment totals";
  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary mb-3">
        {title}
      </p>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-600">Subtotal</span>
          <span className="tabular-nums text-slate-700 font-medium">
            {details?.subtotal ?? "—"}
          </span>
        </div>
        {variant === "discount" && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-600">Discount</span>
            <span className="tabular-nums text-slate-700 font-medium">
              {details?.discountMoney ?? "—"}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-600">Sales tax</span>
          <span className="tabular-nums text-slate-700 font-medium">
            {details?.salesTax ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-600">Tip</span>
          <span className="tabular-nums text-slate-700 font-medium">
            {details?.tip ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-600">Service charge</span>
          <span className="tabular-nums text-slate-700 font-medium">
            {details?.serviceCharge ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 pt-3 text-base font-semibold border-t border-gray-200 mt-2 text-primary">
          <span>Total</span>
          <span className="tabular-nums">{details?.total ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}

export const ActivityLogDetailsModal = ({
  open,
  row,
  displayTimezone,
  onClose,
}: ActivityLogDetailsModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const details = row?.details;
  const isRefund = row?.eventType === "Refunds";
  const itemLabel = isRefund ? "Returned line items" : "Items";

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      return;
    }
    dialogRef.current?.close();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center border-0 bg-transparent p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="activity-log-details-title"
      onClose={onClose}
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-2xl">
        <button
          type="button"
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>

        <div className="relative max-h-[90vh] flex flex-col bg-primary text-primary rounded-xl shadow-lg border-b border-gray-200 overflow-hidden min-w-0">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2
              id="activity-log-details-title"
              className="text-sm md:text-base 2xl:text-lg font-semibold text-white"
            >
              {isRefund ? "Refund" : "Discount"}
            </h2>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5 bg-card-background text-primary">
            <p className="text-lg font-semibold break-words">{row?.name ?? "—"}</p>

            <div className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-primary shrink-0">Notes</span>
                <span className="text-right text-secondary max-w-[65%] min-w-0 text-sm leading-snug whitespace-pre-wrap break-words">
                  {getActivityLogNoteDisplayText(row)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-primary shrink-0">Applied By</span>
                <div className="text-right text-secondary max-w-[65%] min-w-0 text-sm leading-snug">
                  <span>{row?.appliedBy ?? "—"}</span>
                  {row?.appliedByJobTitle != null && row.appliedByJobTitle !== "" && (
                    <>
                      <span> - </span>
                      <span className="text-[11px] sm:text-xs">{row.appliedByJobTitle}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-primary">Location</span>
                <span className="text-right text-secondary max-w-[65%]">{details?.location ?? "—"}</span>
              </div>
              {row?.eventType === "Discounts" && (
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-primary">Applied At</span>
                  <span className="text-right text-secondary text-xs sm:text-sm max-w-[65%]">
                    {formatReadableDateTime(row?.appliedAt ?? null, displayTimezone)}
                  </span>
                </div>
              )}
              {isRefund && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-primary">Original Transaction</span>
                    <span className="text-right text-secondary text-xs sm:text-sm max-w-[60%]">
                      {formatReadableDateTime(details?.originalTransactionAt ?? null, displayTimezone)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-primary">Canceled At</span>
                    <span className="text-right text-secondary text-xs sm:text-sm max-w-[60%]">
                      {formatReadableDateTime(details?.canceledAt ?? null, displayTimezone)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-primary">Refunded At</span>
                    <span className="text-right text-secondary text-xs sm:text-sm max-w-[60%]">
                      {formatReadableDateTime(details?.refundedAt ?? null, displayTimezone)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-gray-200 pt-4">
              <p className="text-xl font-semibold tabular-nums">{details?.paymentTitle ?? "—"}</p>

              <div className="mt-4">
                <p className="text-sm font-semibold text-primary mb-2">{itemLabel}</p>
                <ReceiptLineItemsList
                  items={details?.items ?? []}
                  rightColumnLabel={isRefund ? "Gross return" : "Gross sales"}
                />
              </div>

              <TotalsSection details={details} variant={isRefund ? "refund" : "discount"} />
            </div>
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};

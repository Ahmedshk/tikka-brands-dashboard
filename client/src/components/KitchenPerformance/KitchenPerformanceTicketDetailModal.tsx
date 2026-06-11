import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { KitchenPerformanceTicketRow } from "../../types/kitchenPerformance.types";
import { parseItemsInTicket } from "../../utils/kitchenPerformanceItemsInTicket";
import { formatDateTimeParts } from "../../utils/dateTimeDisplayHelpers";
import { formatDuration, isCompletedAfterDue } from "./kitchenPerformanceTicketUi";

interface KitchenPerformanceTicketDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: KitchenPerformanceTicketRow | null;
  displayTimezone: string;
}

function DetailRow({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-6 py-3 border-b border-gray-200 last:border-b-0">
      <span className="text-sm font-medium text-secondary shrink-0 sm:w-40">{label}</span>
      <div className="text-sm text-primary min-w-0 flex-1">{children}</div>
    </div>
  );
}

function DateTimeInline({
  value,
  displayTimezone,
}: Readonly<{ value: string | null; displayTimezone: string }>) {
  const parts = formatDateTimeParts(value, displayTimezone);
  if (parts.time === "—" && parts.date === "—") {
    return <span>—</span>;
  }
  return (
    <div className="flex flex-row flex-wrap items-baseline gap-x-1.5 min-w-0 leading-tight">
      <span className="text-primary">{parts.time}</span>
      <span className="text-secondary">{parts.date}</span>
    </div>
  );
}

function CompletedAtModalValue({
  timeCompleted,
  timeDue,
  displayTimezone,
}: Readonly<{
  timeCompleted: string | null;
  timeDue: string | null;
  displayTimezone: string;
}>) {
  const parts = formatDateTimeParts(timeCompleted, displayTimezone);
  const late = isCompletedAfterDue(timeCompleted, timeDue);
  if (parts.time === "—" && parts.date === "—") {
    return <span>—</span>;
  }
  if (late) {
    return (
      <div className="flex flex-row flex-wrap items-baseline gap-x-1.5 min-w-0 leading-tight text-red-600 font-semibold">
        <span>{parts.time}</span>
        <span>{parts.date}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-row flex-wrap items-baseline gap-x-1.5 min-w-0 leading-tight">
      <span className="text-primary">{parts.time}</span>
      <span className="text-secondary">{parts.date}</span>
    </div>
  );
}

export const KitchenPerformanceTicketDetailModal = ({
  isOpen,
  onClose,
  row,
  displayTimezone,
}: KitchenPerformanceTicketDetailModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!isOpen || !row) {
      dialogRef.current?.close();
      return;
    }
    dialogRef.current?.showModal();
  }, [isOpen, row]);

  if (!isOpen || !row) return null;

  const parsedItems = parseItemsInTicket(row.itemsInTicket);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="kitchen-ticket-detail-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full min-w-0 max-w-full md:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2
              id="kitchen-ticket-detail-title"
              className="text-sm md:text-base 2xl:text-lg font-semibold text-white break-words"
            >
              {row.ticketName?.trim() ? row.ticketName : "—"}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-white/90">Ticket details</p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-4 border-x border-gray-200">
            <DetailRow label="Order source">
              <span>{row.orderSource?.trim() ? row.orderSource : "—"}</span>
            </DetailRow>
            <DetailRow label="Time in">
              <DateTimeInline value={row.timeCreated} displayTimezone={displayTimezone} />
            </DetailRow>
            <DetailRow label="Time due">
              <DateTimeInline value={row.timeDue} displayTimezone={displayTimezone} />
            </DetailRow>
            <DetailRow label="Completed at">
              <CompletedAtModalValue
                timeCompleted={row.timeCompleted}
                timeDue={row.timeDue}
                displayTimezone={displayTimezone}
              />
            </DetailRow>
            <DetailRow label="Completion time">
              {formatDuration(row.completionTimeSeconds)}
            </DetailRow>
            <DetailRow label="Recalled at">
              <DateTimeInline value={row.timeRecalled} displayTimezone={displayTimezone} />
            </DetailRow>
            <DetailRow label="Items on ticket">
              {parsedItems.length === 0 ? (
                <span>—</span>
              ) : (
                <ul className="list-none space-y-1.5 m-0 p-0">
                  {parsedItems.map((item, i) => (
                    <li key={`${item.itemName}-${i}`} className="break-words">
                      {item.quantity} × {item.itemName}
                    </li>
                  ))}
                </ul>
              )}
            </DetailRow>
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};

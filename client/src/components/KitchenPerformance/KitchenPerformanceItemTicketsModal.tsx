import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { KitchenPerformanceTicketRow } from "../../types/kitchenPerformance.types";
import {
  formatDuration,
  formatTicketItemCount,
  TicketDateCell,
  TicketValueCell,
} from "./kitchenPerformanceTicketUi";

interface KitchenPerformanceItemTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  tickets: KitchenPerformanceTicketRow[];
  displayTimezone: string;
}

export const KitchenPerformanceItemTicketsModal = ({
  isOpen,
  onClose,
  itemName,
  tickets,
  displayTimezone,
}: KitchenPerformanceItemTicketsModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!isOpen) {
      dialogRef.current?.close();
      return;
    }
    dialogRef.current?.showModal();
  }, [isOpen]);

  if (!isOpen) return null;

  const title = `Tickets with ${itemName}`;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="kitchen-item-tickets-modal-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full min-w-0 max-w-full md:max-w-4xl"
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
              id="kitchen-item-tickets-modal-title"
              className="text-sm md:text-base 2xl:text-lg font-semibold text-white break-words"
            >
              {title}
            </h2>
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-5 pt-4 pb-4 border-x border-gray-200">
            {tickets.length === 0 ? (
              <p className="text-sm text-primary/80 text-center py-8">
                No tickets found for this item in the current date range.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
                  <thead>
                    <tr className="text-left text-secondary border-b border-gray-200">
                      <th className="pb-3 pr-4 pl-2 font-semibold">Ticket</th>
                      <th className="pb-3 pr-4 font-semibold">Sent to KDS at</th>
                      <th className="pb-3 pr-4 font-semibold">Time due</th>
                      <th className="pb-3 pr-4 font-semibold">Completed at</th>
                      <th className="pb-3 pr-4 font-semibold">Completion time</th>
                      <th className="pb-3 pr-4 font-semibold">Recalled at</th>
                      <th className="pb-3 pr-2 font-semibold text-right"># of items</th>
                    </tr>
                  </thead>
                  <tbody className="text-primary">
                    {tickets.map((row, index) => (
                      <tr
                        key={`${row.ticketName ?? "ticket"}-${index}`}
                        className={index % 2 === 1 ? "bg-[#F3F5F7]" : ""}
                      >
                        <td className="py-3 pr-4 pl-2">
                          <TicketValueCell
                            ticketName={row.ticketName}
                            orderSource={row.orderSource}
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <TicketDateCell value={row.timeCreated} displayTimezone={displayTimezone} />
                        </td>
                        <td className="py-3 pr-4">
                          <TicketDateCell value={row.timeDue} displayTimezone={displayTimezone} />
                        </td>
                        <td className="py-3 pr-4">
                          <TicketDateCell
                            value={row.timeCompleted}
                            displayTimezone={displayTimezone}
                            compareDueForCompletedAt={row.timeDue}
                          />
                        </td>
                        <td className="py-3 pr-4">{formatDuration(row.completionTimeSeconds)}</td>
                        <td className="py-3 pr-4">
                          <TicketDateCell value={row.timeRecalled} displayTimezone={displayTimezone} />
                        </td>
                        <td className="py-3 pr-2 text-right font-semibold">
                          {formatTicketItemCount(row.numberOfItems)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};

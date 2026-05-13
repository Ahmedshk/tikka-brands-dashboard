import ViewIcon from "@assets/icons/view.svg?react";
import { Spinner } from "../common/Spinner";
import type { KitchenPerformanceDetails as KitchenPerformanceDetailsData } from "../../types/kitchenPerformance.types";
import { formatDuration } from "./kitchenPerformanceTicketUi";

const cardClass =
  "bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden";

type Props = {
  loading: boolean;
  details: KitchenPerformanceDetailsData | null;
  onViewItemTickets: (itemName: string) => void;
};

export const KitchenPerformanceDetailsItemTab = ({
  loading,
  details,
  onViewItemTickets,
}: Props) => {
  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
          Item Performance
        </h3>
      </div>
      <div className="p-5">
        {loading ? (
          <div className="min-h-[320px] flex items-center justify-center">
            <Spinner size="xl" className="text-button-primary" />
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-gray-200 overflow-y-auto min-h-0">
              {(details?.itemPerformanceRows.length ?? 0) === 0 ? (
                <div className="py-8 text-center text-primary/80 text-sm">
                  No data available
                </div>
              ) : (
                details?.itemPerformanceRows.map((row, index) => (
                  <div
                    key={`${row.itemName}-${index}-mobile`}
                    className={`px-3 py-3 ${index % 2 === 1 ? "bg-[#F3F5F7]" : "bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <p className="text-sm font-semibold text-primary truncate min-w-0 flex-1">
                        {row.itemName}
                      </p>
                      <button
                        type="button"
                        onClick={() => onViewItemTickets(row.itemName)}
                        className="shrink-0 p-1.5 text-primary hover:bg-gray-200 rounded transition-colors inline-flex items-center justify-center"
                        aria-label="View tickets for this item"
                        title="View tickets for this item"
                      >
                        <ViewIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="text-secondary">Avg. Completion Time:</span>
                        <span className="text-primary">
                          {formatDuration(row.avgCompletionTimeSeconds)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-secondary">Min. Completion Time:</span>
                        <span className="text-primary">
                          {formatDuration(row.minCompletionTimeSeconds)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-secondary">Max. Completion Time:</span>
                        <span className="text-primary">
                          {formatDuration(row.maxCompletionTimeSeconds)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-secondary">Total Quantity:</span>
                        <span className="text-primary font-semibold">
                          {row.totalQuantity}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
                <thead>
                  <tr className="text-left text-secondary border-b border-gray-200">
                    <th className="pb-3 pr-4 pl-2 font-semibold">Item Name</th>
                    <th className="pb-3 pr-4 font-semibold">
                      Avg. Completion Time
                    </th>
                    <th className="pb-3 pr-4 font-semibold">
                      Min. Completion Time
                    </th>
                    <th className="pb-3 pr-4 font-semibold">
                      Max. Completion Time
                    </th>
                    <th className="pb-3 pr-4 font-semibold text-right">
                      Total Quantity
                    </th>
                    <th className="pb-3 pr-2 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="text-primary">
                  {(details?.itemPerformanceRows.length ?? 0) === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 text-center text-primary/80 text-sm"
                      >
                        No data available
                      </td>
                    </tr>
                  ) : (
                    details?.itemPerformanceRows.map((row, index) => (
                      <tr
                        key={`${row.itemName}-${index}`}
                        className={index % 2 === 1 ? "bg-[#F3F5F7]" : ""}
                      >
                        <td className="py-3 pr-4 pl-2 font-semibold">
                          {row.itemName}
                        </td>
                        <td className="py-3 pr-4">
                          {formatDuration(row.avgCompletionTimeSeconds)}
                        </td>
                        <td className="py-3 pr-4">
                          {formatDuration(row.minCompletionTimeSeconds)}
                        </td>
                        <td className="py-3 pr-4">
                          {formatDuration(row.maxCompletionTimeSeconds)}
                        </td>
                        <td className="py-3 pr-4 text-right font-semibold">
                          {row.totalQuantity}
                        </td>
                        <td className="py-3 pr-2 text-center">
                          <button
                            type="button"
                            onClick={() => onViewItemTickets(row.itemName)}
                            className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors inline-flex items-center justify-center"
                            aria-label="View tickets for this item"
                            title="View tickets for this item"
                          >
                            <ViewIcon className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};


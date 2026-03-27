import ViewIcon from "@assets/icons/view.svg?react";
import type { KitchenPerformanceRow } from "../../types/kitchenPerformance.types";
import { Pagination } from "../common/Pagination";
import { Spinner } from "../common/Spinner";

const cardClass = "bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden";

export interface KitchenPerformanceTableCardPagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

interface KitchenPerformanceTableCardProps {
  rows: KitchenPerformanceRow[];
  loading?: boolean;
  onView?: (row: KitchenPerformanceRow, index: number) => void;
  pagination?: KitchenPerformanceTableCardPagination;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export const KitchenPerformanceTableCard = ({
  rows,
  loading = false,
  onView,
  pagination,
}: KitchenPerformanceTableCardProps) => {
  let content: React.ReactNode;

  if (loading) {
    content = (
      <div className="h-full min-h-[280px] flex flex-col items-center justify-center gap-3 text-primary">
        <Spinner size="xl" className="text-button-primary" />
        <span className="text-sm">Loading kitchen performance...</span>
      </div>
    );
  } else if (rows.length === 0) {
    content = (
      <div className="h-full min-h-[280px] flex items-center justify-center text-primary/80 text-sm">
        No data available
      </div>
    );
  } else {
    content = (
      <>
        <div className="md:hidden divide-y divide-gray-200 overflow-y-auto min-h-0">
          {rows.map((row, index) => (
            <div
              key={`${row.deviceName}-${index}`}
              className={`px-3 py-3 ${index % 2 === 1 ? "bg-[#F3F5F7]" : "bg-white"}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary truncate">{row.deviceName}</p>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="text-secondary">Location:</span>
                  <span className="text-primary">{row.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-secondary">Completed Tickets:</span>
                  <span className="text-primary font-semibold">{row.completedTickets}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-secondary">Avg. Completion Time:</span>
                  <span className="text-primary">{formatDuration(row.avgCompletionTimeSeconds)}</span>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => onView?.(row, index)}
                  className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors inline-flex items-center justify-center"
                  aria-label="View"
                  title="View details"
                >
                  <ViewIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto overflow-y-auto min-h-0">
          <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
            <thead>
              <tr className="text-left text-secondary border-b border-gray-200">
                <th className="pb-3 pr-4 pl-2 font-semibold">Device Name</th>
                <th className="pb-3 pr-4 font-semibold">Location</th>
                <th className="pb-3 pr-4 font-semibold text-center">Completed Tickets</th>
                <th className="pb-3 pr-4 font-semibold text-center">Avg. Completion Time</th>
                <th className="pb-3 pr-2 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="text-primary">
              {rows.map((row, index) => (
                <tr
                  key={`${row.deviceName}-${index}`}
                  className={index % 2 === 1 ? "bg-[#F3F5F7]" : ""}
                >
                  <td className="py-3 pr-4 pl-2 font-semibold">{row.deviceName}</td>
                  <td className="py-3 pr-4">{row.location}</td>
                  <td className="py-3 pr-4 text-center font-semibold">{row.completedTickets}</td>
                  <td className="py-3 pr-4 text-center">{formatDuration(row.avgCompletionTimeSeconds)}</td>
                  <td className="py-3 pr-2 text-center">
                    <button
                      type="button"
                      onClick={() => onView?.(row, index)}
                      className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors inline-flex items-center justify-center"
                      aria-label="View"
                      title="View details"
                    >
                      <ViewIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <div className={`${cardClass} flex flex-col min-h-0 overflow-hidden`}>
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center flex-shrink-0">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
          Kitchen Performance
        </h3>
      </div>
      <div className="p-5 flex-1 min-h-0 overflow-hidden">
        {content}
      </div>
      {pagination && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.onPageChange}
        />
      )}
    </div>
  );
};

import ViewIcon from "@assets/icons/view.svg?react";
import type { ActivityLogRow } from "../../types/activityLog.types";
import { Pagination } from "../common/Pagination";
import { Spinner } from "../common/Spinner";

const cardClass = "bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden";

export interface ActivityLogTableCardPagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

interface ActivityLogTableCardProps {
  rows: ActivityLogRow[];
  loading?: boolean;
  onView?: (row: ActivityLogRow, index: number) => void;
  pagination?: ActivityLogTableCardPagination;
}

function formatDateTimeParts(value: string | null): { time: string; date: string } {
  if (!value) return { time: "—", date: "—" };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { time: "—", date: "—" };
  return {
    time: parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    date: parsed.toLocaleDateString("en-US"),
  };
}

/** Same palette as `getStageStatusColor` in review.types (Past due / Pending). */
function activityEventTypeBadgeClasses(eventType: ActivityLogRow["eventType"]): string {
  switch (eventType) {
    case "Refunds":
      return "text-red-600 bg-red-50";
    case "Discounts":
      return "text-yellow-700 bg-yellow-50";
  }
}

const EVENT_TYPE_BADGE_BASE =
  "inline-block px-2 py-0.5 rounded-full text-[10px] md:text-xs font-medium whitespace-nowrap";

function ActivityLogEventTypeBadge({ eventType }: Readonly<{ eventType: ActivityLogRow["eventType"] }>) {
  return (
    <span className={`${EVENT_TYPE_BADGE_BASE} ${activityEventTypeBadgeClasses(eventType)}`}>
      {eventType}
    </span>
  );
}

function ActivityLogNameCell({
  row,
  className = "",
}: Readonly<{ row: ActivityLogRow; className?: string }>) {
  const rootClass = className ? `min-w-0 break-words leading-snug ${className}` : "min-w-0 break-words leading-snug";
  if (
    row.namePrefix != null &&
    row.namePrefix !== "" &&
    row.nameAmountBadgeText != null &&
    row.nameAmountBadgeText !== ""
  ) {
    return (
      <div className={rootClass}>
        <span>{row.namePrefix}</span>
        <span className="text-secondary mx-1"> - </span>
        <span
          className={`${EVENT_TYPE_BADGE_BASE} tabular-nums align-middle ${activityEventTypeBadgeClasses(row.eventType)}`}
        >
          {row.nameAmountBadgeText}
        </span>
      </div>
    );
  }
  return <span className={rootClass}>{row.name}</span>;
}

export const ActivityLogTableCard = ({
  rows,
  loading = false,
  onView,
  pagination,
}: ActivityLogTableCardProps) => {
  let content: React.ReactNode;

  if (loading) {
    content = (
      <div className="h-full min-h-[280px] flex flex-col items-center justify-center gap-3 text-primary">
        <Spinner size="xl" className="text-button-primary" />
        <span className="text-sm">Loading activity log...</span>
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
          {rows.map((row, index) => {
            const appliedAt = formatDateTimeParts(row.appliedAt);
            return (
              <div
                key={`${row.eventType}-${row.name}-${row.appliedBy}-${index}`}
                className={`px-3 py-3 ${index % 2 === 1 ? "bg-[#F3F5F7]" : "bg-white"}`}
              >
                <ActivityLogNameCell row={row} className="text-sm font-semibold text-primary" />
                <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-secondary shrink-0">Event Type:</span>
                    <ActivityLogEventTypeBadge eventType={row.eventType} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-secondary">Applied By:</span>
                    <span className="text-primary">{row.appliedBy}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-secondary">Timestamp:</span>
                    <span className="text-primary">{`${appliedAt.time} ${appliedAt.date}`}</span>
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
            );
          })}
        </div>

        <div className="hidden md:block overflow-x-auto overflow-y-auto min-h-0">
          <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
            <thead>
              <tr className="text-left text-secondary border-b border-gray-200">
                <th className="pb-3 pr-4 pl-2 font-semibold">Event Type</th>
                <th className="pb-3 pr-4 font-semibold">Name</th>
                <th className="pb-3 pr-4 font-semibold">Applied By</th>
                <th className="pb-3 pr-4 font-semibold">Timestamp</th>
                <th className="pb-3 pr-2 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="text-primary">
              {rows.map((row, index) => {
                const appliedAt = formatDateTimeParts(row.appliedAt);
                return (
                  <tr
                    key={`${row.eventType}-${row.name}-${row.appliedBy}-${index}`}
                    className={index % 2 === 1 ? "bg-[#F3F5F7]" : ""}
                  >
                    <td className="py-3 pr-4 pl-2 align-middle">
                      <ActivityLogEventTypeBadge eventType={row.eventType} />
                    </td>
                    <td className="py-3 pr-4">
                      <ActivityLogNameCell row={row} />
                    </td>
                    <td className="py-3 pr-4">{row.appliedBy}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-col leading-tight">
                        <span className="text-primary">{appliedAt.time}</span>
                        <span className="text-secondary text-[11px]">{appliedAt.date}</span>
                      </div>
                    </td>
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
                );
              })}
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
          Activity Log
        </h3>
      </div>
      <div className="p-5 flex-1 min-h-0 overflow-hidden">{content}</div>
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

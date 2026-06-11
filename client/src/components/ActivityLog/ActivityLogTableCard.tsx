import { useMemo } from "react";
import ViewIcon from "@assets/icons/view.svg?react";
import LocationIcon from "@assets/icons/location.svg?react";
import type { ActivityLogRow } from "../../types/activityLog.types";
import { formatDateTimeParts } from "../../utils/dateTimeDisplayHelpers";
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
  displayTimezone: string;
  /** When true, group rows by location into bordered sections (all-locations view). */
  showLocationLabel?: boolean;
  onView?: (row: ActivityLogRow, index: number) => void;
  pagination?: ActivityLogTableCardPagination;
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

interface LocationGroup {
  locationKey: string;
  locationName: string;
  rows: ActivityLogRow[];
}

function groupRowsByLocation(rows: ActivityLogRow[]): LocationGroup[] {
  const map = new Map<string, LocationGroup>();
  for (const row of rows) {
    const key = row.locationId ?? row.locationName ?? "";
    const name = row.locationName?.trim() || "Unknown Location";
    let group = map.get(key);
    if (!group) {
      group = { locationKey: key, locationName: name, rows: [] };
      map.set(key, group);
    }
    group.rows.push(row);
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => a.locationName.localeCompare(b.locationName));
  return groups;
}

function LocationSectionHeader({ name }: Readonly<{ name: string }>) {
  return (
    <div className="bg-[#F3F5F7] border-b border-gray-200 px-3 md:px-5 py-2.5 flex items-center gap-1.5 min-h-[36px]">
      <LocationIcon className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" aria-hidden />
      <span className="text-xs text-gray-500 truncate leading-none">{name}</span>
    </div>
  );
}

function DesktopHeader({ topSpacing }: Readonly<{ topSpacing: boolean }>) {
  const topPad = topSpacing ? "pt-4" : "";
  // Fixed column widths so per-location section tables align column-for-
  // column. The Name column has no width and absorbs the remaining space
  // (works with `table-fixed` on the parent `<table>`).
  return (
    <thead>
      <tr className="text-left text-secondary border-b border-gray-200">
        <th className={`${topPad} pb-3 pr-4 pl-2 md:pl-5 font-semibold w-28 md:w-32`}>Event Type</th>
        <th className={`${topPad} pb-3 pr-4 font-semibold`}>Name</th>
        <th className={`${topPad} pb-3 pr-4 font-semibold w-32 md:w-40`}>Applied By</th>
        <th className={`${topPad} pb-3 pr-4 font-semibold text-center w-24 md:w-32`}>Timestamp</th>
        <th className={`${topPad} pb-3 pr-2 md:pr-5 font-semibold text-center w-16 md:w-20`}>Action</th>
      </tr>
    </thead>
  );
}

function DesktopRow({
  row,
  index,
  rowKey,
  displayTimezone,
  onView,
}: Readonly<{
  row: ActivityLogRow;
  index: number;
  rowKey: string;
  displayTimezone: string;
  onView?: (row: ActivityLogRow, index: number) => void;
}>) {
  const appliedAt = formatDateTimeParts(row.appliedAt, displayTimezone);
  return (
    <tr key={rowKey} className={index % 2 === 1 ? "bg-[#F3F5F7]" : ""}>
      <td className="py-3 pr-4 pl-2 md:pl-5 align-middle">
        <ActivityLogEventTypeBadge eventType={row.eventType} />
      </td>
      <td className="py-3 pr-4">
        <ActivityLogNameCell row={row} />
      </td>
      <td className="py-3 pr-4">{row.appliedBy}</td>
      <td className="py-3 pr-4 text-center">
        <div className="flex flex-col leading-tight items-center">
          <span className="text-primary">{appliedAt.time}</span>
          <span className="text-secondary text-[11px]">{appliedAt.date}</span>
        </div>
      </td>
      <td className="py-3 pr-2 md:pr-5 text-center">
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
}

function DesktopTable({
  rows,
  rowKeyPrefix,
  topSpacing,
  displayTimezone,
  onView,
}: Readonly<{
  rows: ActivityLogRow[];
  rowKeyPrefix: string;
  topSpacing: boolean;
  displayTimezone: string;
  onView?: (row: ActivityLogRow, index: number) => void;
}>) {
  return (
    <table className="w-full table-fixed border-collapse text-[10px] md:text-xs 2xl:text-sm">
      <DesktopHeader topSpacing={topSpacing} />
      <tbody className="text-primary">
        {rows.map((row, index) => {
          const key = `${rowKeyPrefix}-${row.eventType}-${row.name}-${row.appliedBy}-${row.appliedAt ?? ""}-${index}`;
          return (
            <DesktopRow
              key={key}
              rowKey={key}
              row={row}
              index={index}
              displayTimezone={displayTimezone}
              onView={onView}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function MobileRow({
  row,
  index,
  rowKey,
  displayTimezone,
  onView,
}: Readonly<{
  row: ActivityLogRow;
  index: number;
  rowKey: string;
  displayTimezone: string;
  onView?: (row: ActivityLogRow, index: number) => void;
}>) {
  const appliedAt = formatDateTimeParts(row.appliedAt, displayTimezone);
  return (
    <div
      key={rowKey}
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
}

function MobileList({
  rows,
  rowKeyPrefix,
  displayTimezone,
  onView,
}: Readonly<{
  rows: ActivityLogRow[];
  rowKeyPrefix: string;
  displayTimezone: string;
  onView?: (row: ActivityLogRow, index: number) => void;
}>) {
  return (
    <div className="divide-y divide-gray-200">
      {rows.map((row, index) => {
        const key = `${rowKeyPrefix}-${row.eventType}-${row.name}-${row.appliedBy}-${row.appliedAt ?? ""}-${index}-mobile`;
        return (
          <MobileRow
            key={key}
            rowKey={key}
            row={row}
            index={index}
            displayTimezone={displayTimezone}
            onView={onView}
          />
        );
      })}
    </div>
  );
}

export const ActivityLogTableCard = ({
  rows,
  loading = false,
  displayTimezone,
  showLocationLabel = false,
  onView,
  pagination,
}: ActivityLogTableCardProps) => {
  const groups = useMemo<LocationGroup[] | null>(() => {
    if (!showLocationLabel || rows.length === 0) return null;
    return groupRowsByLocation(rows);
  }, [rows, showLocationLabel]);

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
  } else if (groups) {
    // Grouped (all-locations) view: each location renders as its own bordered
    // section with a gray header bar — same pattern as the Timesheet card.
    content = (
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div
            key={group.locationKey}
            className="border border-gray-200 rounded-lg overflow-hidden bg-white"
          >
            <LocationSectionHeader name={group.locationName} />
            <div className="hidden md:block overflow-x-auto">
              <DesktopTable
                rows={group.rows}
                rowKeyPrefix={`l-${group.locationKey}`}
                topSpacing
                displayTimezone={displayTimezone}
                onView={onView}
              />
            </div>
            <div className="md:hidden">
              <MobileList
                rows={group.rows}
                rowKeyPrefix={`l-${group.locationKey}`}
                displayTimezone={displayTimezone}
                onView={onView}
              />
            </div>
          </div>
        ))}
      </div>
    );
  } else {
    // Single-location flat view.
    content = (
      <>
        <div className="hidden md:block overflow-x-auto overflow-y-auto min-h-0">
          <DesktopTable
            rows={rows}
            rowKeyPrefix="flat"
            topSpacing={false}
            displayTimezone={displayTimezone}
            onView={onView}
          />
        </div>
        <div className="md:hidden overflow-y-auto min-h-0">
          <MobileList
            rows={rows}
            rowKeyPrefix="flat"
            displayTimezone={displayTimezone}
            onView={onView}
          />
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

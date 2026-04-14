import { useState, useMemo, useEffect } from 'react';
import type { CalendarEventDto } from '../../types/calendar.types';
import { Pagination } from '../common/Pagination';
import EditIcon from '@assets/icons/edit.svg?react';
import DeleteIcon from '@assets/icons/delete.svg?react';
import LocationIcon from '@assets/icons/location.svg?react';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

const DEFAULT_PAGE_SIZE = 5;

export interface UpcomingEventItem {
  id: string;
  /** e.g. same day: "March 31 ⋅ 6:00 AM - 7:00 AM"; multi-day: "March 31, 6:00 AM - April 1, 7:00 AM" */
  dateTiming: string;
  /** Trimmed description text; empty when none. */
  description: string;
  eventName: string;
  status: string;
  /** Store label when listing all locations. */
  locationName?: string;
}

export interface UpcomingEventRow extends UpcomingEventItem {
  event: CalendarEventDto;
}

export interface UpcomingEventsCardProps {
  rows: UpcomingEventRow[];
  pageSize?: number;
  className?: string;
  /** When true, show store name with each event (all-locations): inline before title on desktop, above on mobile. */
  showLocationLabel?: boolean;
  onEdit?: (row: UpcomingEventRow) => void;
  onDelete?: (row: UpcomingEventRow) => void;
}

function UpcomingEventLocationLine({ name }: Readonly<{ name: string }>) {
  return (
    <p className="text-xs text-gray-400 mb-1 flex items-center gap-1 truncate min-w-0">
      <LocationIcon className="w-3 h-3 flex-shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
    </p>
  );
}

function sameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function buildUpcomingEventRows(events: CalendarEventDto[]): UpcomingEventRow[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  const future = sorted.filter((e) => new Date(e.start).getTime() >= todayStart.getTime());
  const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  const formatDay = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const dot = '\u22C5';

  return future.map((dto) => {
    const start = new Date(dto.start);
    const end = new Date(dto.end);
    const startTime = start.toLocaleTimeString('en-US', timeOpts);
    const endTime = end.toLocaleTimeString('en-US', timeOpts);

    let dateTiming: string;
    if (sameLocalCalendarDay(start, end)) {
      const dateStr = formatDay(start);
      const hasRange = end.getTime() > start.getTime();
      const timePart = hasRange ? `${startTime} - ${endTime}` : startTime;
      dateTiming = `${dateStr} ${dot} ${timePart}`;
    } else {
      dateTiming = `${formatDay(start)}, ${startTime} - ${formatDay(end)}, ${endTime}`;
    }

    const locationName = dto.locationName?.trim();
    return {
      id: dto._id,
      dateTiming,
      description: (dto.description ?? '').trim(),
      eventName: dto.title,
      status: 'Scheduled',
      ...(locationName ? { locationName } : {}),
      event: dto,
    };
  });
}

export const UpcomingEventsCard = ({
  rows,
  pageSize = DEFAULT_PAGE_SIZE,
  className = '',
  showLocationLabel = false,
  onEdit,
  onDelete,
}: UpcomingEventsCardProps) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const clampedPage = Math.min(currentPage, totalPages);
  const displayPage = Math.max(1, clampedPage);

  useEffect(() => {
    if (currentPage > totalPages && totalPages >= 1) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (displayPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, displayPage, pageSize]);

  const showActions = Boolean(onEdit || onDelete);
  const desktopColSpan = showActions ? 5 : 4;

  return (
    <div className={`${cardClass} flex flex-col min-h-0 overflow-hidden ${className}`}>
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center justify-center md:justify-start flex-wrap gap-2 flex-shrink-0">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">Upcoming Events</h3>
      </div>
      <div className="p-5 flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="hidden md:block overflow-x-auto overflow-y-auto flex-1 min-h-0">
          <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
            <thead>
              <tr className="text-left text-secondary border-b border-gray-200">
                <th className="pb-3 pr-4 pl-2 font-semibold">Event</th>
                <th className="pb-3 pr-4 font-semibold">Date &amp; Timing</th>
                <th className="pb-3 pr-4 font-semibold">Description</th>
                <th className="pb-3 pr-2 font-semibold text-center">Status</th>
                {showActions ? (
                  <th className="pb-3 pr-2 font-semibold text-center">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="text-primary">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={desktopColSpan} className="py-12 px-5 text-center text-secondary text-sm">
                    No upcoming events.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, index) => {
                  const locLabel = row.locationName?.trim();
                  return (
                  <tr key={row.id} className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}>
                    <td className="py-3 pr-4 pl-2">
                      {showLocationLabel && locLabel ? (
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400 shrink-0 max-w-[min(100%,18rem)] min-w-0">
                            <LocationIcon className="w-3 h-3 flex-shrink-0" aria-hidden />
                            <span className="truncate">{locLabel}</span>
                          </span>
                          <span className="text-gray-300 select-none shrink-0" aria-hidden>
                            ·
                          </span>
                          <span className="text-primary font-medium whitespace-normal break-words min-w-0">
                            {row.eventName}
                          </span>
                        </div>
                      ) : (
                        row.eventName
                      )}
                    </td>
                    <td className="py-3 pr-4 align-top">{row.dateTiming}</td>
                    <td className="py-3 pr-4 align-top text-primary whitespace-normal break-words">
                      {row.description || '—'}
                    </td>
                    <td className="py-3 pr-2 text-center">
                      <span className="inline-flex items-center justify-end bg-[rgba(93,197,79,0.2)] text-primary text-[9px] md:text-[10px] 2xl:text-xs font-medium px-2 py-0.5 rounded-lg">
                        {row.status}
                      </span>
                    </td>
                    {showActions ? (
                      <td className="py-3 pr-2">
                        <div className="flex items-center justify-center gap-2">
                          {onEdit ? (
                            <button
                              type="button"
                              onClick={() => onEdit(row)}
                              className="p-1 text-primary hover:bg-gray-200 rounded transition-colors"
                              aria-label="Edit"
                              title="Edit"
                            >
                              <EditIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                            </button>
                          ) : null}
                          {onDelete ? (
                            <button
                              type="button"
                              onClick={() => onDelete(row)}
                              className="p-1 text-primary hover:bg-gray-200 rounded transition-colors"
                              aria-label="Delete"
                              title="Delete"
                            >
                              <DeleteIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden flex flex-col flex-1 min-h-0 rounded-t-xl overflow-hidden -mx-5 px-5">
          {paginatedRows.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8 px-2 flex-1 flex items-center justify-center min-h-[120px]">
              No upcoming events.
            </p>
          ) : (
            <div className="divide-y divide-gray-200 overflow-y-auto flex-1 min-h-0">
              {paginatedRows.map((row, index) => {
                const locLabel = row.locationName?.trim();
                return (
                <div
                  key={row.id}
                  className={`px-3 py-3 ${index % 2 === 1 ? 'bg-[#F3F5F7]' : 'bg-white'}`}
                >
                  <div className="min-w-0">
                    {showLocationLabel && locLabel ? <UpcomingEventLocationLine name={locLabel} /> : null}
                    <p className="text-sm font-medium text-primary whitespace-normal break-words">{row.eventName}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                    <div className="flex items-start gap-2">
                      <span className="text-secondary shrink-0">Date &amp; timing:</span>
                      <span className="text-primary whitespace-normal break-words">{row.dateTiming}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-secondary shrink-0">Description:</span>
                      <span className="text-primary whitespace-normal break-words min-w-0">
                        {row.description || '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-secondary shrink-0">Status:</span>
                      <span className="inline-flex items-center bg-[rgba(93,197,79,0.2)] text-primary font-medium px-2 py-0.5 rounded-lg">
                        {row.status}
                      </span>
                    </div>
                  </div>
                  {showActions ? (
                    <div className="mt-3 flex items-center justify-end gap-2">
                      {onEdit ? (
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors"
                          aria-label="Edit"
                          title="Edit"
                        >
                          <EditIcon className="w-4 h-4" />
                        </button>
                      ) : null}
                      {onDelete ? (
                        <button
                          type="button"
                          onClick={() => onDelete(row)}
                          className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <DeleteIcon className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {totalItems > 0 && (
          <Pagination
            currentPage={displayPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
        )}
      </div>
    </div>
  );
};

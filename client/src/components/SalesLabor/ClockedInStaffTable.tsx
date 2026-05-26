import { useMemo } from 'react';
import { TimesheetLocationLabel } from '../../utils/timesheetLocationLabel';

export interface TimesheetRow {
  name: string;
  role: string;
  clockIn: string | null;
  clockOut: string | null;
  totalHours: number;
  status: 'On Clock' | 'On Break' | 'Clocked Out';
  locationId?: string;
  locationName?: string | null;
}

/** @deprecated Use TimesheetRow instead */
export type ClockedInStaffRow = TimesheetRow;

export interface ClockedInStaffTableProps {
  rows: TimesheetRow[];
  /** When true, group rows by locationName (used in all-locations view). */
  groupByLocation?: boolean;
}

const statusClass: Record<TimesheetRow['status'], string> = {
  'On Clock': 'rounded-full px-2 py-0.5 text-xs font-medium bg-[rgba(93,197,79,0.2)] text-primary',
  'On Break': 'rounded-full px-2 py-0.5 text-xs font-medium bg-[rgba(253,185,14,0.2)] text-primary',
  'Clocked Out': 'rounded-full px-2 py-0.5 text-xs font-medium bg-[rgba(156,163,175,0.2)] text-primary',
};

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return '—';
  let hour = Number(match[1]);
  const minute = match[2];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return '—';
  const yyyy = match[1] ?? '';
  const mm = match[2] ?? '';
  const dd = match[3] ?? '';
  return `${mm}/${dd}/${yyyy.slice(-2)}`;
}

/** Stable date key (YYYY-MM-DD) for grouping and sorting. */
function dateKey(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m?.[1] ?? '';
}

function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hrs`;
  return `${h} hrs ${m} min`;
}

function compareRows(a: TimesheetRow, b: TimesheetRow): number {
  const da = dateKey(a.clockIn);
  const db = dateKey(b.clockIn);
  if (da !== db) return da < db ? -1 : 1;
  const ta = a.clockIn ?? '';
  const tb = b.clockIn ?? '';
  if (ta === tb) return 0;
  return ta < tb ? -1 : 1;
}

interface GroupedRows {
  locationKey: string;
  locationName: string;
  rows: TimesheetRow[];
}

function groupRowsByLocation(rows: TimesheetRow[]): GroupedRows[] {
  const map = new Map<string, GroupedRows>();
  for (const row of rows) {
    const key = row.locationId ?? row.locationName ?? '';
    const name = row.locationName?.trim() || 'Unknown Location';
    let group = map.get(key);
    if (!group) {
      group = { locationKey: key, locationName: name, rows: [] };
      map.set(key, group);
    }
    group.rows.push(row);
  }
  const groups = Array.from(map.values());
  for (const g of groups) g.rows.sort(compareRows);
  groups.sort((a, b) => a.locationName.localeCompare(b.locationName));
  return groups;
}

function DesktopRow({
  row,
  index,
  showDate,
}: Readonly<{ row: TimesheetRow; index: number; showDate: boolean }>) {
  return (
    <tr className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}>
      <td className="py-3 pr-4 pl-2 md:pl-5">
        <div className="min-w-0">
          <div className="font-medium text-primary truncate" title={row.name}>{row.name}</div>
          {row.role && (
            <div className="text-primary text-[10px] md:text-[10px] 2xl:text-xs truncate">{row.role}</div>
          )}
        </div>
      </td>
      {showDate && (
        <td className="py-3 pr-4 text-center whitespace-nowrap">{formatDate(row.clockIn)}</td>
      )}
      <td className="py-3 pr-4 text-center">{formatTime(row.clockIn)}</td>
      <td className="py-3 pr-4 text-center">{formatTime(row.clockOut)}</td>
      <td className="py-3 pr-4 text-center">{formatDuration(row.totalHours)}</td>
      <td className="py-3 pr-2 md:pr-0">
        <div className="flex justify-center">
          <span className={`inline-block text-center ${statusClass[row.status]}`}>{row.status}</span>
        </div>
      </td>
    </tr>
  );
}

function DesktopHeader({ showDate }: Readonly<{ showDate: boolean }>) {
  return (
    <thead>
      <tr className="text-left text-secondary">
        <th className="pb-3 pr-4 pl-2 md:pl-5 font-semibold">Name</th>
        {showDate && <th className="pb-3 pr-4 font-semibold text-center">Date</th>}
        <th className="pb-3 pr-4 font-semibold text-center">Clock In</th>
        <th className="pb-3 pr-4 font-semibold text-center">Clock Out</th>
        <th className="pb-3 pr-4 font-semibold text-center">Total Time</th>
        <th className="pb-3 pr-2 md:pr-0 font-semibold text-center">Status</th>
      </tr>
    </thead>
  );
}

function MobileRow({
  row,
  index,
  showDate,
}: Readonly<{ row: TimesheetRow; index: number; showDate: boolean }>) {
  return (
    <div className={`px-3 py-3 ${index % 2 === 1 ? 'bg-[#F3F5F7]' : 'bg-white'}`}>
      <p className="text-sm font-semibold text-primary truncate" title={row.name}>{row.name}</p>
      {row.role && <p className="text-xs text-gray-600 mt-0.5 truncate">{row.role}</p>}
      <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
        {showDate && (
          <div className="flex items-center gap-2">
            <span className="text-secondary shrink-0">Date:</span>
            <span className="text-primary">{formatDate(row.clockIn)}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-secondary shrink-0">Clock in:</span>
          <span className="text-primary">{formatTime(row.clockIn)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-secondary shrink-0">Clock out:</span>
          <span className="text-primary">{formatTime(row.clockOut)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-secondary shrink-0">Total time:</span>
          <span className="text-primary">{formatDuration(row.totalHours)}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-secondary shrink-0">Status:</span>
          <span className={`inline-block ${statusClass[row.status]}`}>{row.status}</span>
        </div>
      </div>
    </div>
  );
}

export const ClockedInStaffTable = ({ rows, groupByLocation = false }: ClockedInStaffTableProps) => {
  const showDate = useMemo(() => {
    const days = new Set<string>();
    for (const r of rows) {
      const k = dateKey(r.clockIn);
      if (k) days.add(k);
      if (days.size > 1) return true;
    }
    return false;
  }, [rows]);

  const groups = useMemo<GroupedRows[]>(() => {
    if (groupByLocation) return groupRowsByLocation(rows);
    return [{ locationKey: '__all__', locationName: '', rows: [...rows].sort(compareRows) }];
  }, [rows, groupByLocation]);

  const desktopColSpan = showDate ? 6 : 5;

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
          <DesktopHeader showDate={showDate} />
          <tbody className="text-primary">
            {groups.map((group) => (
              <DesktopGroup
                key={group.locationKey}
                group={group}
                showDate={showDate}
                showHeader={groupByLocation}
                colSpan={desktopColSpan}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="md:hidden -mx-5 px-5">
        <div className="divide-y divide-gray-200 overflow-y-auto min-h-0">
          {groups.map((group) => (
            <div key={`m-${group.locationKey}`}>
              {groupByLocation && (
                <div className="px-3 pt-3">
                  <TimesheetLocationLabel name={group.locationName} />
                </div>
              )}
              {group.rows.map((row, index) => (
                <MobileRow
                  key={`${group.locationKey}-${row.name}-${index}-mobile`}
                  row={row}
                  index={index}
                  showDate={showDate}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

function DesktopGroup({
  group,
  showDate,
  showHeader,
  colSpan,
}: Readonly<{
  group: GroupedRows;
  showDate: boolean;
  showHeader: boolean;
  colSpan: number;
}>) {
  return (
    <>
      {showHeader && (
        <tr>
          <td colSpan={colSpan} className="pt-3 pb-1 pl-2 md:pl-5">
            <TimesheetLocationLabel name={group.locationName} />
          </td>
        </tr>
      )}
      {group.rows.map((row, index) => (
        <DesktopRow
          key={`${group.locationKey}-${row.name}-${index}`}
          row={row}
          index={index}
          showDate={showDate}
        />
      ))}
    </>
  );
}

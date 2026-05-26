import { useMemo } from 'react';
import LocationIcon from '@assets/icons/location.svg?react';

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

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

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

/** Stable date key (YYYY-MM-DD) for grouping and sorting. */
function dateKey(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m?.[1] ?? '';
}

function formatDateKeyLong(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key || '—';
  const y = Number(m[1]);
  const m0 = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (Number.isNaN(y) || Number.isNaN(m0) || Number.isNaN(d)) return key;
  return `${MONTH_NAMES[m0]} ${d}, ${y}`;
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

interface DateGroup {
  dateKey: string;
  rows: TimesheetRow[];
}

interface LocationGroup {
  locationKey: string;
  locationName: string;
  rows: TimesheetRow[];
}

function groupRowsByLocation(rows: TimesheetRow[]): LocationGroup[] {
  const map = new Map<string, LocationGroup>();
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

function groupRowsByDate(rows: TimesheetRow[]): DateGroup[] {
  const map = new Map<string, DateGroup>();
  for (const row of rows) {
    const key = dateKey(row.clockIn);
    let group = map.get(key);
    if (!group) {
      group = { dateKey: key, rows: [] };
      map.set(key, group);
    }
    group.rows.push(row);
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.rows.sort((a, b) => {
      const ta = a.clockIn ?? '';
      const tb = b.clockIn ?? '';
      if (ta === tb) return 0;
      return ta < tb ? -1 : 1;
    });
  }
  // Empty / missing dateKey sorts last.
  groups.sort((a, b) => {
    if (a.dateKey === b.dateKey) return 0;
    if (!a.dateKey) return 1;
    if (!b.dateKey) return -1;
    return a.dateKey < b.dateKey ? -1 : 1;
  });
  return groups;
}

function DesktopRow({
  row,
  index,
  rowKey,
}: Readonly<{ row: TimesheetRow; index: number; rowKey: string }>) {
  return (
    <tr key={rowKey} className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}>
      <td className="py-3 pr-4 pl-2 md:pl-5">
        <div className="min-w-0">
          <div className="font-semibold text-primary truncate" title={row.name}>{row.name}</div>
          {row.role && (
            <div className="text-primary text-[10px] md:text-[10px] 2xl:text-xs truncate">{row.role}</div>
          )}
        </div>
      </td>
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

function DesktopHeader({ topSpacing }: Readonly<{ topSpacing: boolean }>) {
  const topPad = topSpacing ? 'pt-4' : '';
  return (
    <thead>
      <tr className="text-left text-secondary">
        <th className={`${topPad} pb-3 pr-4 pl-2 md:pl-5 font-semibold`}>Name</th>
        <th className={`${topPad} pb-3 pr-4 font-semibold text-center`}>Clock In</th>
        <th className={`${topPad} pb-3 pr-4 font-semibold text-center`}>Clock Out</th>
        <th className={`${topPad} pb-3 pr-4 font-semibold text-center`}>Total Time</th>
        <th className={`${topPad} pb-3 pr-2 md:pr-0 font-semibold text-center`}>Status</th>
      </tr>
    </thead>
  );
}

function MobileRow({
  row,
  index,
  rowKey,
}: Readonly<{ row: TimesheetRow; index: number; rowKey: string }>) {
  return (
    <div key={rowKey} className={`px-3 py-3 ${index % 2 === 1 ? 'bg-[#F3F5F7]' : 'bg-white'}`}>
      <p className="text-sm font-semibold text-primary truncate" title={row.name}>{row.name}</p>
      {row.role && <p className="text-xs text-secondary mt-0.5 truncate">{row.role}</p>}
      <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
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

function DesktopTable({
  rows,
  rowKeyPrefix,
  topSpacing,
}: Readonly<{
  rows: TimesheetRow[];
  rowKeyPrefix: string;
  topSpacing: boolean;
}>) {
  return (
    <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
      <DesktopHeader topSpacing={topSpacing} />
      <tbody className="text-primary">
        {rows.map((row, index) => (
          <DesktopRow
            key={`${rowKeyPrefix}-${row.name}-${index}`}
            rowKey={`${rowKeyPrefix}-${row.name}-${index}`}
            row={row}
            index={index}
          />
        ))}
      </tbody>
    </table>
  );
}

function MobileList({
  rows,
  rowKeyPrefix,
}: Readonly<{ rows: TimesheetRow[]; rowKeyPrefix: string }>) {
  return (
    <div className="divide-y divide-gray-200">
      {rows.map((row, index) => (
        <MobileRow
          key={`${rowKeyPrefix}-${row.name}-${index}-mobile`}
          rowKey={`${rowKeyPrefix}-${row.name}-${index}-mobile`}
          row={row}
          index={index}
        />
      ))}
    </div>
  );
}

function LocationSectionHeader({ name }: Readonly<{ name: string }>) {
  return (
    <div className="bg-[#F3F5F7] border-b border-gray-200 px-3 md:px-5 py-2.5 flex items-center gap-1.5 min-h-[36px]">
      <LocationIcon className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" aria-hidden />
      <span className="text-xs text-gray-500 truncate leading-none">{name}</span>
    </div>
  );
}

function DateSectionHeader({ dateKey }: Readonly<{ dateKey: string }>) {
  return (
    <div className="bg-[#F3F5F7] border-b border-gray-200 px-3 md:px-5 py-2.5 flex items-center gap-1.5 min-h-[36px]">
      <span className="text-xs font-semibold text-gray-500 truncate leading-none">
        {formatDateKeyLong(dateKey)}
      </span>
    </div>
  );
}

interface DateBlockProps {
  group: DateGroup;
  rowKeyPrefix: string;
  topSpacing: boolean;
  withHeader: boolean;
}

function DateBlock({ group, rowKeyPrefix, topSpacing, withHeader }: Readonly<DateBlockProps>) {
  return (
    <>
      {withHeader && <DateSectionHeader dateKey={group.dateKey} />}
      <div className="hidden md:block overflow-x-auto">
        <DesktopTable
          rows={group.rows}
          rowKeyPrefix={rowKeyPrefix}
          topSpacing={topSpacing}
        />
      </div>
      <div className="md:hidden">
        <MobileList rows={group.rows} rowKeyPrefix={rowKeyPrefix} />
      </div>
    </>
  );
}

export const ClockedInStaffTable = ({ rows, groupByLocation = false }: ClockedInStaffTableProps) => {
  const multiDay = useMemo(() => {
    const days = new Set<string>();
    for (const r of rows) {
      const k = dateKey(r.clockIn);
      if (k) days.add(k);
      if (days.size > 1) return true;
    }
    return false;
  }, [rows]);

  const groupByDate = multiDay;

  // Case 1: flat list (single location, single day).
  if (!groupByLocation && !groupByDate) {
    const sorted = [...rows].sort(compareRows);
    return (
      <DateBlock
        group={{ dateKey: '', rows: sorted }}
        rowKeyPrefix="flat"
        topSpacing={false}
        withHeader={false}
      />
    );
  }

  // Case 2: group by date only (single location, multi-day).
  if (!groupByLocation && groupByDate) {
    const dateGroups = groupRowsByDate(rows);
    return (
      <div className="flex flex-col gap-4">
        {dateGroups.map((dg) => (
          <div
            key={`d-${dg.dateKey}`}
            className="border border-gray-200 rounded-lg overflow-hidden bg-white"
          >
            <DateBlock
              group={dg}
              rowKeyPrefix={`d-${dg.dateKey}`}
              topSpacing
              withHeader
            />
          </div>
        ))}
      </div>
    );
  }

  // Case 3 & 4: group by location (optionally with nested date subgroups).
  const locationGroups = groupRowsByLocation(rows);
  return (
    <div className="flex flex-col gap-4">
      {locationGroups.map((lg) => {
        const dateGroups = groupByDate ? groupRowsByDate(lg.rows) : null;
        return (
          <div
            key={`l-${lg.locationKey}`}
            className="border border-gray-200 rounded-lg overflow-hidden bg-white"
          >
            <LocationSectionHeader name={lg.locationName} />
            {dateGroups ? (
              <div className="flex flex-col gap-4 p-3 md:p-4 bg-white">
                {dateGroups.map((dg) => (
                  <div
                    key={`l-${lg.locationKey}-d-${dg.dateKey}`}
                    className="border border-gray-200 rounded-lg overflow-hidden bg-white"
                  >
                    <DateBlock
                      group={dg}
                      rowKeyPrefix={`l-${lg.locationKey}-d-${dg.dateKey}`}
                      topSpacing
                      withHeader
                    />
                  </div>
                ))}
              </div>
            ) : (
              <DateBlock
                group={{ dateKey: '', rows: lg.rows }}
                rowKeyPrefix={`l-${lg.locationKey}`}
                topSpacing
                withHeader={false}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

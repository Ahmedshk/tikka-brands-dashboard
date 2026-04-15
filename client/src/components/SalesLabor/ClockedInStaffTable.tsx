export interface TimesheetRow {
  name: string;
  role: string;
  clockIn: string | null;
  clockOut: string | null;
  totalHours: number;
  status: 'On Clock' | 'On Break' | 'Clocked Out';
}

/** @deprecated Use TimesheetRow instead */
export type ClockedInStaffRow = TimesheetRow;

export interface ClockedInStaffTableProps {
  rows: TimesheetRow[];
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

function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hrs`;
  return `${h} hrs ${m} min`;
}

export const ClockedInStaffTable = ({ rows }: ClockedInStaffTableProps) => {
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
          <thead>
            <tr className="text-left text-secondary">
              <th className="pb-3 pr-4 pl-2 md:pl-5 font-semibold">Name</th>
              <th className="pb-3 pr-4 font-semibold text-center">Role</th>
              <th className="pb-3 pr-4 font-semibold text-center">Clock In</th>
              <th className="pb-3 pr-4 font-semibold text-center">Clock Out</th>
              <th className="pb-3 pr-4 font-semibold text-center">Total Time</th>
              <th className="pb-3 pr-2 md:pr-0 font-semibold text-center">Status</th>
            </tr>
          </thead>
          <tbody className="text-primary">
            {rows.map((row, index) => (
              <tr
                key={`${row.name}-${index}`}
                className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
              >
                <td className="py-3 pr-4 pl-2 md:pl-5">{row.name}</td>
                <td className="py-3 pr-4 text-center">{row.role}</td>
                <td className="py-3 pr-4 text-center">{formatTime(row.clockIn)}</td>
                <td className="py-3 pr-4 text-center">{formatTime(row.clockOut)}</td>
                <td className="py-3 pr-4 text-center">{formatDuration(row.totalHours)}</td>
                <td className="py-3 pr-2 md:pr-0">
                  <div className="flex justify-center">
                    <span className={`inline-block text-center ${statusClass[row.status]}`}>{row.status}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards (matches training-management EmployeeTrainingCard) */}
      <div className="md:hidden -mx-5 px-5">
        <div className="divide-y divide-gray-200 overflow-y-auto min-h-0">
          {rows.map((row, index) => (
            <div
              key={`${row.name}-${index}-mobile`}
              className={`px-3 py-3 ${index % 2 === 1 ? 'bg-[#F3F5F7]' : 'bg-white'}`}
            >
              <p className="text-sm font-semibold text-primary truncate" title={row.name}>
                {row.name}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                <div className="flex items-start gap-2">
                  <span className="text-secondary shrink-0">Role:</span>
                  <span className="text-primary whitespace-normal break-words">{row.role}</span>
                </div>
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
          ))}
        </div>
      </div>
    </>
  );
};

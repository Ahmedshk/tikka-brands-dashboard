import type { EmployeeTrainingRow } from '../../types/trainingReviews.types';
import { Spinner } from '../common/Spinner';
import { Pagination } from '../common/Pagination';
import { getModuleSegmentStatuses } from '../../utils/trainingProgressUtils';
import ViewIcon from '@assets/icons/view.svg?react';
import EditIcon from '@assets/icons/edit.svg?react';
import DeleteIcon from '@assets/icons/delete.svg?react';
import { employeeInitials, getUserProfileProxyImageUrl } from '../../utils/employeeBioHelpers';
import { TimesheetLocationLabel } from '../../utils/timesheetLocationLabel';
import { getEmployeeTrainingCardViewState, getEmployeeTrainingRowKey } from '../../utils/employeeTrainingCardHelpers';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

const statusClass: Record<EmployeeTrainingRow['status'], string> = {
  Complete: 'text-positive font-medium',
  Pending: 'text-pending font-medium',
  NotStarted: 'text-secondary font-medium',
};

function statusLabel(status: EmployeeTrainingRow['status']): string {
  if (status === 'Complete') return 'Complete';
  if (status === 'NotStarted') return 'Not Started';
  return 'In Progress';
}

const SEGMENT_COLORS: Record<'green' | 'yellow' | 'red' | 'gray', string> = {
  green: '#5DC54F',
  yellow: '#FDB90E',
  red: '#DC2626',
  gray: '#E5E7EB',
};

const SEGMENTS_PER_LINE = 5;

/** Matches Location Management table first column inset. */
const thFirstColClass =
  'text-left font-semibold px-4 lg:px-6 py-3 lg:py-4 text-[10px] md:text-xs 2xl:text-sm text-white';
const tdFirstColClass = 'px-4 lg:px-6 py-3 lg:py-4';

const thClass =
  'font-semibold px-2 pr-4 py-3 md:py-2 2xl:py-3 text-[10px] md:text-xs 2xl:text-sm text-white';
const thActionsClass =
  'font-semibold px-2 py-3 md:py-2 2xl:py-3 text-[10px] md:text-xs 2xl:text-sm text-white text-center';

function ProgressSegments({ row, keyPrefix }: { readonly row: EmployeeTrainingRow; readonly keyPrefix: string }) {
  const total = Math.max(1, row.totalModules);
  const lines: number[][] = [];
  for (let i = 0; i < total; i += SEGMENTS_PER_LINE) {
    lines.push(Array.from({ length: Math.min(SEGMENTS_PER_LINE, total - i) }, (_, j) => i + j));
  }
  const fallbackStatuses: ('green' | 'gray')[] = Array.from(
    { length: total },
    (_, i) => (row.completedModules > i ? 'green' : 'gray')
  );
  const segmentStatuses: ('green' | 'yellow' | 'red' | 'gray')[] =
    row.moduleDurations?.length > 0 && row.moduleProgress?.length > 0
      ? getModuleSegmentStatuses(row.assignedAt, row.moduleDurations, row.moduleProgress)
      : fallbackStatuses;
  return (
    <div className="flex flex-col gap-1 justify-start">
      {lines.map((lineIndices) => (
        <div key={`${keyPrefix}-${lineIndices[0]}`} className="flex gap-0.5 h-2 shrink-0">
          {lineIndices.map((i) => {
            const status = segmentStatuses[i];
            const backgroundColor = status ? SEGMENT_COLORS[status] : SEGMENT_COLORS.gray;
            return (
              <div
                key={`${keyPrefix}-seg-${i}`}
                className="h-full w-4 rounded-sm shrink-0"
                style={{ backgroundColor }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export interface EmployeeTrainingCardPagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export interface EmployeeTrainingCardProps {
  rows: EmployeeTrainingRow[];
  /** When true, shows a centered spinner in the table body (column headers stay visible on desktop). */
  loading?: boolean;
  /** When true, show store name above employee name (all-locations view). */
  showLocationLabel?: boolean;
  /** Trimmed debounced query for empty-state copy (search UI lives outside the card). */
  debouncedSearch: string;
  /** Row count returned by the API for the current search (before hierarchy filter). */
  searchMatchCount: number;
  /** Row count after applying hierarchy / role visibility filter. */
  filteredTotal: number;
  onView?: (row: EmployeeTrainingRow, index: number) => void;
  onEdit?: (row: EmployeeTrainingRow, index: number) => void;
  onDelete?: (row: EmployeeTrainingRow, index: number) => void;
  pagination?: EmployeeTrainingCardPagination;
}

function EmployeeNameCell({
  row,
  showLocationLabel,
}: Readonly<{
  row: EmployeeTrainingRow;
  showLocationLabel: boolean;
}>) {
  const avatarUrl = getUserProfileProxyImageUrl(row.userId, row.profileImagePublicId);
  const initials = employeeInitials({ email: row.assignTo });
  const locLabel = row.locationName?.trim();

  return (
    <div className="min-w-0">
      {showLocationLabel && locLabel ? <TimesheetLocationLabel name={locLabel} /> : null}
      <div className="flex items-center gap-2 min-w-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 bg-gray-100" />
        ) : (
          <span className="w-8 h-8 rounded-full bg-button-primary text-white flex items-center justify-center text-sm font-semibold shrink-0">
            {initials}
          </span>
        )}
        <div className="min-w-0">
          <div className="font-semibold text-primary truncate">{row.assignTo}</div>
          <div className="text-primary text-[10px] md:text-[10px] 2xl:text-xs truncate">{row.role}</div>
        </div>
      </div>
    </div>
  );
}

function DesktopBody({
  view,
  rows,
  showLocationLabel,
  onView,
  onEdit,
  onDelete,
}: Readonly<{
  view: ReturnType<typeof getEmployeeTrainingCardViewState>;
  rows: EmployeeTrainingRow[];
  showLocationLabel: boolean;
  onView?: (row: EmployeeTrainingRow, index: number) => void;
  onEdit?: (row: EmployeeTrainingRow, index: number) => void;
  onDelete?: (row: EmployeeTrainingRow, index: number) => void;
}>) {
  switch (view.kind) {
    case 'loading':
      return (
        <tr>
          <td colSpan={5} className="p-0">
            <div className="flex min-h-[200px] items-center justify-center py-8" aria-busy="true">
              <Spinner size="lg" className="text-button-primary" />
            </div>
          </td>
        </tr>
      );
    case 'empty-search':
      return (
        <tr>
          <td colSpan={5} className="py-12 px-5 text-center text-secondary text-sm">
            No assignments match this search.
          </td>
        </tr>
      );
    case 'empty-no-search':
      return (
        <tr>
          <td colSpan={5} className="py-12 px-5 text-center text-secondary text-sm">
            <p className="text-lg font-medium text-gray-400">No assignments yet</p>
            <p className="text-sm mt-1 text-gray-400">Assign training to employees to see progress here.</p>
          </td>
        </tr>
      );
    case 'empty-hierarchy':
      return (
        <tr>
          <td colSpan={5} className="py-12 px-5 text-center text-secondary text-sm">
            No assignments are visible for your role hierarchy.
          </td>
        </tr>
      );
    case 'rows':
      return (
        <>
          {rows.map((row, index) => (
            <tr key={getEmployeeTrainingRowKey(row, index, 'desktop')} className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}>
              <td className={`${tdFirstColClass} align-top`}>
                <EmployeeNameCell row={row} showLocationLabel={showLocationLabel} />
              </td>
              <td className="py-3 pr-4">{row.trainingName}</td>
              <td className="py-3 pr-4">
                <ProgressSegments row={row} keyPrefix={`${row.trainingName}-${row.assignTo}-${index}`} />
              </td>
              <td className="py-3 pr-4 text-center">
                <span className={statusClass[row.status]}>{statusLabel(row.status)}</span>
              </td>
              <td className="py-3 pr-2">
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => onView?.(row, index)}
                    className="p-1 text-primary hover:bg-gray-200 rounded transition-colors"
                    aria-label="View"
                    title="View"
                  >
                    <ViewIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit?.(row, index)}
                    className="p-1 text-primary hover:bg-gray-200 rounded transition-colors"
                    aria-label="Edit"
                    title="Edit"
                  >
                    <EditIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete?.(row, index)}
                    className="p-1 text-primary hover:bg-gray-200 rounded transition-colors"
                    aria-label="Delete"
                    title="Delete"
                  >
                    <DeleteIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </>
      );
  }
}

function MobileBody({
  view,
  rows,
  showLocationLabel,
  onView,
  onEdit,
  onDelete,
}: Readonly<{
  view: ReturnType<typeof getEmployeeTrainingCardViewState>;
  rows: EmployeeTrainingRow[];
  showLocationLabel: boolean;
  onView?: (row: EmployeeTrainingRow, index: number) => void;
  onEdit?: (row: EmployeeTrainingRow, index: number) => void;
  onDelete?: (row: EmployeeTrainingRow, index: number) => void;
}>) {
  switch (view.kind) {
    case 'loading':
      return (
        <div className="flex min-h-[200px] items-center justify-center" aria-busy="true">
          <Spinner size="lg" className="text-button-primary" />
        </div>
      );
    case 'empty-search':
      return (
        <p className="text-sm text-gray-500 text-center py-8 px-2 flex items-center justify-center min-h-[200px]">
          No assignments match this search.
        </p>
      );
    case 'empty-no-search':
      return (
        <div className="flex min-h-[200px] items-center justify-center px-2">
          <div className="text-center text-gray-400">
            <p className="text-lg font-medium">No assignments yet</p>
            <p className="text-sm mt-1">Assign training to employees to see progress here.</p>
          </div>
        </div>
      );
    case 'empty-hierarchy':
      return (
        <p className="text-sm text-secondary text-center py-8 px-2 flex items-center justify-center min-h-[200px]">
          No assignments are visible for your role hierarchy.
        </p>
      );
    case 'rows':
      return (
        <div className="divide-y divide-gray-200 overflow-y-auto min-h-0 -mx-5 px-5">
          {rows.map((row, index) => {
            const avatarUrl = getUserProfileProxyImageUrl(row.userId, row.profileImagePublicId);
            const initials = employeeInitials({ email: row.assignTo });
            const locLabel = row.locationName?.trim();
            return (
              <div
                key={getEmployeeTrainingRowKey(row, index, 'mobile')}
                className={`px-3 py-3 ${index % 2 === 1 ? 'bg-[#F3F5F7]' : 'bg-white'}`}
              >
                <div className="min-w-0">
                  {showLocationLabel && locLabel ? <TimesheetLocationLabel name={locLabel} /> : null}
                  <p className="flex items-center gap-2 text-sm font-medium text-primary truncate" title={row.assignTo}>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 bg-gray-100" />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-button-primary text-white flex items-center justify-center text-sm font-semibold shrink-0">
                        {initials}
                      </span>
                    )}
                    <span className="truncate">{row.assignTo}</span>
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">{row.role}</p>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                  <div className="flex items-start gap-2">
                    <span className="text-secondary shrink-0">Training:</span>
                    <span className="text-primary whitespace-normal break-words">{row.trainingName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-secondary shrink-0">Progress:</span>
                    <ProgressSegments row={row} keyPrefix={`${row.trainingName}-${row.assignTo}-${index}-mobile`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-secondary shrink-0">Status:</span>
                    <span className={statusClass[row.status]}>{statusLabel(row.status)}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onView?.(row, index)}
                    className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors"
                    aria-label="View"
                    title="View"
                  >
                    <ViewIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit?.(row, index)}
                    className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors"
                    aria-label="Edit"
                    title="Edit"
                  >
                    <EditIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete?.(row, index)}
                    className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors"
                    aria-label="Delete"
                    title="Delete"
                  >
                    <DeleteIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      );
  }
}

export const EmployeeTrainingCard = ({
  rows,
  loading = false,
  showLocationLabel = false,
  debouncedSearch,
  searchMatchCount,
  filteredTotal,
  onView,
  onEdit,
  onDelete,
  pagination,
}: EmployeeTrainingCardProps) => {
  const view = getEmployeeTrainingCardViewState({ loading, debouncedSearch, searchMatchCount, filteredTotal });

  return (
    <div className={`${cardClass} flex flex-col min-h-0 overflow-hidden`}>
      <div className="flex flex-col min-h-0 overflow-hidden">
        {/* Desktop: column headers in primary bar + body */}
        <div className="hidden md:block overflow-x-auto overflow-y-auto min-h-0">
          <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
            <thead>
              <tr className="bg-primary text-white">
                <th className={thFirstColClass}>Employee Name</th>
                <th className={`${thClass} text-left`}>Training</th>
                <th className={`${thClass} text-left`}>Progress</th>
                <th className={thActionsClass}>Status</th>
                <th className={`${thActionsClass}`}>Actions</th>
              </tr>
            </thead>
            <tbody className="text-primary">
              <DesktopBody
                view={view}
                rows={rows}
                showLocationLabel={showLocationLabel}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </tbody>
          </table>
        </div>

        {/* Mobile: stacked cards (no table header row) */}
        <div className="md:hidden rounded-t-xl overflow-hidden">
          <div className="p-5">
            <MobileBody
              view={view}
              rows={rows}
              showLocationLabel={showLocationLabel}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        </div>
      </div>
      {pagination && filteredTotal > 0 && (
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

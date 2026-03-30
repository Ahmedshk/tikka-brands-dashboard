import type { EmployeeTrainingRow } from '../../types/trainingReviews.types';
import { Spinner } from '../common/Spinner';
import { getModuleSegmentStatuses } from '../../utils/trainingProgressUtils';
import ViewIcon from '@assets/icons/view.svg?react';
import EditIcon from '@assets/icons/edit.svg?react';
import DeleteIcon from '@assets/icons/delete.svg?react';
import AddIcon from '@assets/icons/add.svg?react';
import SearchIcon from '@assets/icons/search.svg?react';

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
const CARD_DISPLAY_LIMIT = 8;

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

export interface EmployeeTrainingCardProps {
  rows: EmployeeTrainingRow[];
  /** When true, shows a centered spinner in the card body (header unchanged). */
  loading?: boolean;
  /** Controlled search field (debounced fetch lives in parent). */
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  /** Trimmed debounced query for empty-state copy. */
  debouncedSearch: string;
  /** Total matches from API (after name filter, before client role filter). */
  previewTotal: number;
  /** Show View All when API reports more rows than the card limit. */
  hasMore: boolean;
  onView?: (row: EmployeeTrainingRow, index: number) => void;
  onEdit?: (row: EmployeeTrainingRow, index: number) => void;
  onDelete?: (row: EmployeeTrainingRow, index: number) => void;
  onAssignTraining?: () => void;
  onViewAll?: () => void;
}

export const EmployeeTrainingCard = ({
  rows,
  loading = false,
  searchInput,
  onSearchInputChange,
  debouncedSearch,
  previewTotal,
  hasMore,
  onView,
  onEdit,
  onDelete,
  onAssignTraining,
  onViewAll,
}: EmployeeTrainingCardProps) => {
  const displayRows = rows.slice(0, CARD_DISPLAY_LIMIT);

  return (
    <div className={`${cardClass} flex flex-col h-full min-h-0`}>
      <div className="rounded-t-xl bg-primary px-5 py-2 md:py-2 flex-shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white shrink-0">
          Employee Training
        </h3>
        <label className="sr-only" htmlFor="employee-training-search">
          Search employee training by name
        </label>
        <div className="relative w-full min-w-0 sm:max-w-[220px] md:max-w-xs">
          <SearchIcon
            className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5 text-secondary shrink-0 pointer-events-none"
            aria-hidden
          />
          <input
            id="employee-training-search"
            type="search"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            placeholder="Search by name…"
            autoComplete="off"
            className="search-input-gray-clear w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-gray-300/50"
          />
        </div>
      </div>
      <div className="p-5 flex flex-col flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex flex-1 min-h-[200px] items-center justify-center" aria-busy="true">
            <Spinner size="lg" className="text-button-primary" />
          </div>
        ) : previewTotal === 0 && debouncedSearch ? (
          <p className="text-sm text-gray-500 text-center py-8 px-2 flex-1 flex items-center justify-center min-h-[200px]">
            No assignments match this search.
          </p>
        ) : previewTotal === 0 && !debouncedSearch ? (
          <div className="flex flex-1 min-h-[200px] items-center justify-center px-2">
            <div className="text-center text-gray-400">
              <p className="text-lg font-medium">No assignments yet</p>
              <p className="text-sm mt-1">Assign training to employees to see progress here.</p>
            </div>
          </div>
        ) : (
        <>
        <div className="md:hidden divide-y divide-gray-200 overflow-y-auto flex-1 min-h-0">
          {displayRows.map((row, index) => {
            const rowKey = row.assignmentId ?? `${row.trainingName}-${row.assignTo}-${index}`;
            return (
            <div
              key={`${rowKey}-mobile`}
              className={`px-3 py-3 ${index % 2 === 1 ? 'bg-[#F3F5F7]' : 'bg-white'}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary whitespace-normal break-words">{row.assignTo}</p>
                <p className="text-xs text-secondary mt-0.5">{row.role}</p>
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
                  <span className={statusClass[row.status]}>
                    {statusLabel(row.status)}
                  </span>
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

        <div className="hidden md:block overflow-x-auto overflow-y-auto flex-1 min-h-0">
          <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
            <thead>
              <tr className="text-left text-secondary border-b border-gray-200">
                <th className="pb-3 pr-4 pl-2 font-semibold">Employee Name</th>
                <th className="pb-3 pr-4 font-semibold">Role</th>
                <th className="pb-3 pr-4 font-semibold">Training</th>
                <th className="pb-3 pr-4 font-semibold">Progress</th>
                <th className="pb-3 pr-4 font-semibold text-center">Status</th>
                <th className="pb-3 pr-2 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="text-primary">
              {displayRows.map((row, index) => (
                <tr
                  key={row.assignmentId ?? `${row.trainingName}-${row.assignTo}-${index}`}
                  className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                >
                  <td className="py-3 pr-4 pl-2">{row.assignTo}</td>
                  <td className="py-3 pr-4">{row.role}</td>
                  <td className="py-3 pr-4">{row.trainingName}</td>
                  <td className="py-3 pr-4">
                    <ProgressSegments row={row} keyPrefix={`${row.trainingName}-${row.assignTo}-${index}`} />
                  </td>
                  <td className="py-3 pr-4 text-center">
                    <span className={statusClass[row.status]}>
                      {statusLabel(row.status)}
                    </span>
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
            </tbody>
          </table>
        </div>
        </>
        )}
        {!loading && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAssignTraining}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              title="Assign training"
            >
              <AddIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" aria-hidden />
              Assign Training
            </button>
          </div>
          {onViewAll != null && hasMore && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-sm font-medium text-quaternary hover:underline bg-transparent border-0 cursor-pointer p-0"
              title="View all"
            >
              View All
            </button>
          )}
        </div>
        )}
      </div>
    </div>
  );
};

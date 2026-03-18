import type { EmployeeTrainingRow } from '../../types/trainingReviews.types';
import { getModuleSegmentStatuses } from '../../utils/trainingProgressUtils';
import ViewIcon from '@assets/icons/view.svg?react';
import EditIcon from '@assets/icons/edit.svg?react';
import DeleteIcon from '@assets/icons/delete.svg?react';
import AddIcon from '@assets/icons/add.svg?react';

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
  onView?: (row: EmployeeTrainingRow, index: number) => void;
  onEdit?: (row: EmployeeTrainingRow, index: number) => void;
  onDelete?: (row: EmployeeTrainingRow, index: number) => void;
  onAssignTraining?: () => void;
  onViewAll?: () => void;
}

export const EmployeeTrainingCard = ({
  rows,
  onView,
  onEdit,
  onDelete,
  onAssignTraining,
  onViewAll,
}: EmployeeTrainingCardProps) => {
  const displayRows = rows.slice(0, CARD_DISPLAY_LIMIT);
  const hasMore = rows.length > CARD_DISPLAY_LIMIT;

  return (
    <div className={`${cardClass} flex flex-col h-full min-h-0`}>
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center flex-shrink-0">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
          Employee Training
        </h3>
      </div>
      <div className="p-5 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
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
      </div>
    </div>
  );
};

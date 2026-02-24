import type { StaffListRow } from '../../types/trainingReviews.types';
import ViewIcon from '@assets/icons/view.svg?react';
import EditIcon from '@assets/icons/edit.svg?react';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

const reviewStatusClass: Record<StaffListRow['reviewStatus'], string> = {
  Complete: 'text-positive font-medium',
  'Due Soon': 'text-[#FDB90E] font-medium',
  'Over Due': 'text-negative font-medium',
};

export interface StaffListCardProps {
  rows: StaffListRow[];
  onView?: (row: StaffListRow, index: number) => void;
  onEdit?: (row: StaffListRow, index: number) => void;
  onViewAll?: () => void;
}

export const StaffListCard = ({ rows, onView, onEdit, onViewAll }: StaffListCardProps) => {
  return (
    <div className={`${cardClass} flex flex-col h-full min-h-0`}>
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center flex-shrink-0">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">Staff List</h3>
      </div>
      <div className="p-5 overflow-x-auto flex-1 min-h-0">
        <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
          <thead>
            <tr className="text-left text-secondary border-b border-gray-200">
              <th className="pb-3 pr-4 pl-2 font-semibold">Name</th>
              <th className="pb-3 pr-4 font-semibold text-center">Role</th>
              <th className="pb-3 pr-4 font-semibold text-center">Hire Date</th>
              <th className="pb-3 pr-4 font-semibold text-center">Tenure</th>
              <th className="pb-3 pr-4 font-semibold text-center">Review Status</th>
              <th className="pb-3 pr-2 font-semibold text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="text-primary">
            {rows.map((row, index) => (
              <tr
                key={`${row.name}-${row.role}-${index}`}
                className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
              >
                <td className="py-3 pr-4 pl-2">{row.name}</td>
                <td className="py-3 pr-4 text-center">{row.role}</td>
                <td className="py-3 pr-4 text-center">{row.hireDate}</td>
                <td className="py-3 pr-4 text-center">{row.tenure}</td>
                <td className="py-3 pr-4 text-center">
                  <span className={reviewStatusClass[row.reviewStatus]}>{row.reviewStatus}</span>
                </td>
                <td className="py-3 pr-2">
                  <div className="flex items-center justify-center gap-1 md:gap-2">
                    <button
                      type="button"
                      onClick={() => onView?.(row, index)}
                      className="p-1 text-secondary hover:text-primary rounded"
                      aria-label="View"
                      title="View"
                    >
                      <ViewIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit?.(row, index)}
                      className="p-1 text-secondary hover:text-primary rounded"
                      aria-label="Edit"
                      title="Edit"
                    >
                      <EditIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onViewAll != null && (
        <div className="px-5 pb-5 flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm font-medium text-quaternary hover:underline bg-transparent border-0 cursor-pointer p-0"
            title="View all"
          >
            View All
          </button>
        </div>
      )}
    </div>
  );
};

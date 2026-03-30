import type { Training } from '../../types/trainingReviews.types';
import { Spinner } from '../common/Spinner';
import { Pagination } from '../common/Pagination';
import EditIcon from '@assets/icons/edit.svg?react';
import DeleteIcon from '@assets/icons/delete.svg?react';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

export interface TrainingsCardPagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export interface TrainingsCardProps {
  trainings: Training[];
  /** When true, shows a centered spinner in the table body (column headers stay visible). */
  loading?: boolean;
  onEdit?: (training: Training, index: number) => void;
  onDelete?: (training: Training, index: number) => void;
  pagination?: TrainingsCardPagination;
}

export const TrainingsCard = ({ trainings, loading = false, onEdit, onDelete, pagination }: TrainingsCardProps) => {
  return (
    <div className={`${cardClass} flex flex-col h-full min-h-0`}>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
          <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
            <thead>
              <tr className="bg-primary text-white">
                <th className="text-left font-semibold px-5 py-3 md:py-2 2xl:py-3 text-[10px] md:text-xs 2xl:text-sm">
                  Training Name
                </th>
                <th className="text-center font-semibold px-4 py-3 md:py-2 2xl:py-3 text-[10px] md:text-xs 2xl:text-sm">
                  Modules
                </th>
                <th className="text-center font-semibold px-4 py-3 md:py-2 2xl:py-3 text-[10px] md:text-xs 2xl:text-sm">
                  Duration (Days)
                </th>
                <th className="text-center font-semibold px-5 py-3 md:py-2 2xl:py-3 text-[10px] md:text-xs 2xl:text-sm">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="text-primary">
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-0">
                    <div
                      className="flex min-h-[200px] items-center justify-center py-8"
                      aria-busy="true"
                    >
                      <Spinner size="lg" className="text-button-primary" />
                    </div>
                  </td>
                </tr>
              ) : trainings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 px-5 text-center text-secondary text-sm">
                    No trainings yet. Use Create to add one.
                  </td>
                </tr>
              ) : (
                trainings.map((training, index) => (
                  <tr
                    key={training.id}
                    className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                  >
                    <td className="py-3 px-5">{training.name}</td>
                    <td className="py-3 px-4 text-center">{training.moduleCount}</td>
                    <td className="py-3 px-4 text-center">{training.durationDays}</td>
                    <td className="py-3 px-5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit?.(training, index)}
                          className="p-1 text-primary hover:bg-gray-200 rounded transition-colors"
                          aria-label="Edit"
                          title="Edit"
                        >
                          <EditIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete?.(training, index)}
                          className="p-1 text-primary hover:bg-gray-200 rounded transition-colors"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <DeleteIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
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

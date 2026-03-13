import type { Training } from '../../types/trainingReviews.types';
import ViewIcon from '@assets/icons/view.svg?react';
import EditIcon from '@assets/icons/edit.svg?react';
import DeleteIcon from '@assets/icons/delete.svg?react';
import AddIcon from '@assets/icons/add.svg?react';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

export interface TrainingsCardProps {
  trainings: Training[];
  onView?: (training: Training, index: number) => void;
  onEdit?: (training: Training, index: number) => void;
  onDelete?: (training: Training, index: number) => void;
  onCreate?: () => void;
  onViewAll?: () => void;
}

export const TrainingsCard = ({ trainings, onView, onEdit, onDelete, onCreate, onViewAll }: TrainingsCardProps) => {
  return (
    <div className={`${cardClass} flex flex-col h-full min-h-0`}>
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center flex-shrink-0">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">Trainings</h3>
      </div>
      <div className="p-5 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
          <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
            <thead>
              <tr className="text-left text-secondary border-b border-gray-200">
                <th className="pb-3 pr-4 pl-2 font-semibold">Training Name</th>
                <th className="pb-3 pr-4 font-semibold text-center">Modules</th>
                <th className="pb-3 pr-2 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="text-primary">
              {trainings.map((training, index) => (
                <tr
                  key={training.id}
                  className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                >
                  <td className="py-3 pr-4 pl-2">{training.name}</td>
                  <td className="py-3 pr-4 text-center">{training.moduleCount}</td>
                  <td className="py-3 pr-2">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => onView?.(training, index)}
                        className="p-1 text-primary hover:bg-gray-200 rounded transition-colors"
                        aria-label="View"
                        title="View"
                      >
                        <ViewIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                      </button>
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
              ))}
            </tbody>
          </table>
        </div>
        {(onCreate != null || onViewAll != null) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
            {onCreate != null && (
              <button
                type="button"
                onClick={onCreate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                title="Create training"
              >
                <AddIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" aria-hidden />
                Create
              </button>
            )}
            {onViewAll != null && (
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

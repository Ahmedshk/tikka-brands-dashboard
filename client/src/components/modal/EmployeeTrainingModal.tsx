import { useEffect, useRef, useState } from 'react';
import { Pagination } from '../common/Pagination';
import type { EmployeeTrainingRow } from '../../types/trainingReviews.types';
import ViewIcon from '@assets/icons/view.svg?react';
import EditIcon from '@assets/icons/edit.svg?react';
import DeleteIcon from '@assets/icons/delete.svg?react';

const PAGE_SIZE = 10;

const statusClass: Record<EmployeeTrainingRow['status'], string> = {
  Complete: 'text-positive font-medium',
  Pending: 'text-pending font-medium',
};

const SEGMENTS_PER_LINE = 5;

function ProgressSegments({ row, keyPrefix }: { readonly row: EmployeeTrainingRow; readonly keyPrefix: string }) {
  const total = Math.max(1, row.totalModules);
  const lines: number[][] = [];
  for (let i = 0; i < total; i += SEGMENTS_PER_LINE) {
    lines.push(Array.from({ length: Math.min(SEGMENTS_PER_LINE, total - i) }, (_, j) => i + j));
  }
  const filledColor = row.status === 'Complete' ? '#5DC54F' : '#FDB90E';
  return (
    <div className="flex flex-col gap-1 justify-start">
      {lines.map((lineIndices) => (
        <div key={`${keyPrefix}-${lineIndices[0]}`} className="flex gap-0.5 h-2 shrink-0">
          {lineIndices.map((i) => {
            const isFilled = row.totalModules > 0 && i < row.completedModules;
            const backgroundColor = row.totalModules > 0 && isFilled ? filledColor : '#E5E7EB';
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

export interface EmployeeTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: EmployeeTrainingRow[];
  onView?: (row: EmployeeTrainingRow, index: number) => void;
  onEdit?: (row: EmployeeTrainingRow, index: number) => void;
  onDelete?: (row: EmployeeTrainingRow, index: number) => void;
}

export const EmployeeTrainingModal = ({
  isOpen,
  onClose,
  rows,
  onView,
  onEdit,
  onDelete,
}: EmployeeTrainingModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
      setPage(1);
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[300] m-0 grid h-screen w-screen min-h-screen min-w-full max-w-none max-h-none place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="employee-training-modal-title"
      onClose={onClose}
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-5xl">
        <button
          type="button"
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2 id="employee-training-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              Employee Training
            </h2>
          </div>
          <div className="flex-1 min-h-0 min-w-0 flex flex-col px-5 pt-4 overflow-hidden border-x border-gray-200">
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-auto md:[scrollbar-gutter:stable]">
              <table className="w-full min-w-[400px] border-collapse text-[10px] md:text-xs 2xl:text-sm">
                <thead>
                  <tr className="text-left text-secondary border-b border-gray-200">
                    <th className="pb-3 pr-4 pl-2 font-semibold">Employee Name</th>
                    <th className="pb-3 pr-4 font-semibold">Training</th>
                    <th className="pb-3 pr-4 font-semibold">Progress</th>
                    <th className="pb-3 pr-4 font-semibold text-center">Status</th>
                    <th className="pb-3 pr-2 font-semibold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-primary">
                  {pageRows.map((row, index) => {
                    const globalIndex = start + index;
                    return (
                      <tr
                        key={`${row.trainingName}-${row.assignTo}-${globalIndex}`}
                        className={globalIndex % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                      >
                        <td className="py-3 pr-4 pl-2">{row.assignTo}</td>
                        <td className="py-3 pr-4">{row.trainingName}</td>
                        <td className="py-3 pr-4">
                          <ProgressSegments
                            row={row}
                            keyPrefix={`${row.trainingName}-${row.assignTo}-${globalIndex}`}
                          />
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <span className={statusClass[row.status]}>
                            {row.status === 'Complete' ? 'Complete' : 'In Progress'}
                          </span>
                        </td>
                        <td className="py-3 pr-2">
                          <div className="flex items-center justify-center gap-1 md:gap-2">
                            <button
                              type="button"
                              onClick={() => onView?.(row, globalIndex)}
                              className="p-1 text-primary hover:bg-gray-200 rounded transition-colors"
                              aria-label="View"
                              title="View"
                            >
                              <ViewIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onEdit?.(row, globalIndex)}
                              className="p-1 text-primary hover:bg-gray-200 rounded transition-colors"
                              aria-label="Edit"
                              title="Edit"
                            >
                              <EditIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete?.(row, globalIndex)}
                              className="p-1 text-primary hover:bg-gray-200 rounded transition-colors"
                              aria-label="Delete"
                              title="Delete"
                            >
                              <DeleteIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={rows.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        </div>
      </div>
    </dialog>
  );
};

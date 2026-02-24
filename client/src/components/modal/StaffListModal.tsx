import { useEffect, useRef, useState } from 'react';
import { Pagination } from '../common/Pagination';
import type { StaffListRow } from '../../types/trainingReviews.types';
import ViewIcon from '@assets/icons/view.svg?react';
import EditIcon from '@assets/icons/edit.svg?react';

const PAGE_SIZE = 10;

const reviewStatusClass: Record<StaffListRow['reviewStatus'], string> = {
  Complete: 'text-positive font-medium',
  'Due Soon': 'text-[#FDB90E] font-medium',
  'Over Due': 'text-negative font-medium',
};

export interface StaffListModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: StaffListRow[];
  onView?: (row: StaffListRow, index: number) => void;
  onEdit?: (row: StaffListRow, index: number) => void;
}

export const StaffListModal = ({ isOpen, onClose, rows, onView, onEdit }: StaffListModalProps) => {
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
      aria-labelledby="staff-list-modal-title"
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
            <h2 id="staff-list-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              Staff List
            </h2>
          </div>
          <div className="flex-1 min-h-0 min-w-0 flex flex-col px-5 pt-4 overflow-hidden border-x border-gray-200">
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-auto md:[scrollbar-gutter:stable]">
              <table className="w-full min-w-[400px] border-collapse text-[10px] md:text-xs 2xl:text-sm">
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
                  {pageRows.map((row, index) => (
                    <tr
                      key={`${row.name}-${row.role}-${start + index}`}
                      className={(start + index) % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
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
                            onClick={() => onView?.(row, start + index)}
                            className="p-1 text-secondary hover:text-primary rounded"
                            aria-label="View"
                            title="View"
                          >
                            <ViewIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onEdit?.(row, start + index)}
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

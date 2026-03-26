import type { DisciplinaryRow, DisciplinaryStatus } from '../../types/disciplinaryManagement.types';
import { Pagination } from '../common/Pagination';
import { Spinner } from '../common/Spinner';
import PendingIcon from '@assets/icons/pending.svg?react';
import CompliantIcon from '@assets/icons/compliant.svg?react';
import ViewIcon from '@assets/icons/view.svg?react';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

export interface DisciplinaryTableCardPagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const statusPillClass: Record<DisciplinaryStatus, string> = {
  Caution: 'rounded-full px-2 py-0.5 text-[8px] text-[10px] 2xl:text-xs font-medium bg-[#FEF08A] text-[#854D0E]',
  'At Risk': 'rounded-full px-2 py-0.5 text-[8px] text-[10px] 2xl:text-xs font-medium bg-[#D97706] text-white',
  'Good Standing': 'rounded-full px-2 py-0.5 text-[8px] text-[10px] 2xl:text-xs font-medium bg-[rgba(93,197,79,0.2)] text-primary',
  Critical: 'rounded-full px-2 py-0.5 text-[8px] text-[10px] 2xl:text-xs font-medium bg-negative text-white',
};

function pointsColorClass(status: DisciplinaryStatus): string {
  if (status === 'Critical') return 'text-[#FF1C28] font-bold';
  return 'text-primary';
}

function getInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed[0]?.toUpperCase() ?? '?';
}

export interface DisciplinaryTableCardProps {
  rows: DisciplinaryRow[];
  loading?: boolean;
  onView?: (row: DisciplinaryRow, index: number) => void;
  pagination?: DisciplinaryTableCardPagination;
}

export const DisciplinaryTableCard = ({ rows, loading = false, onView, pagination }: DisciplinaryTableCardProps) => {
  return (
    <div className={`${cardClass} flex flex-col min-h-0 overflow-hidden`}>
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center flex-shrink-0">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
          Disciplinary Records
        </h3>
      </div>
      <div className="p-5 flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-3 text-primary">
            <Spinner size="xl" className="text-button-primary" />
            <span className="text-sm">Loading employees...</span>
          </div>
        ) : (
          <>
        <div className="md:hidden divide-y divide-gray-200 overflow-y-auto min-h-0">
          {rows.map((row, index) => (
            <div
              key={`${row.name}-${row.role}-${index}-mobile`}
              className={`px-3 py-3 ${index % 2 === 1 ? 'bg-[#F3F5F7]' : 'bg-white'}`}
            >
              <div className="flex items-start gap-2">
                <div
                  className="w-8 h-8 rounded-full bg-button-primary text-white flex items-center justify-center text-sm font-semibold shrink-0"
                  aria-hidden
                >
                  {getInitial(row.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary whitespace-normal break-words">{row.name}</p>
                  <p className="text-xs text-secondary mt-0.5">{row.role}</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="text-secondary">90-day Points:</span>
                  <span className={`font-bold ${pointsColorClass(row.status)}`}>{row.points90Day}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-secondary">Most Recent:</span>
                  <span className="text-primary">{row.mostRecent}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-secondary">Status:</span>
                  <span className={statusPillClass[row.status]}>
                    {row.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-secondary">E-Sign Status:</span>
                  <div className="flex items-center gap-1.5">
                    {row.eSignStatus.type === 'pending' ? (
                      <>
                        <PendingIcon className="w-3.5 h-3.5 shrink-0 text-pending" aria-hidden />
                        <span className="text-pending font-semibold">{row.eSignStatus.count} Pending</span>
                      </>
                    ) : (
                      <>
                        <CompliantIcon className="w-3.5 h-3.5 shrink-0 text-positive" aria-hidden />
                        <span className="text-positive font-semibold">Compliant</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => onView?.(row, index)}
                  className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors inline-flex items-center justify-center"
                  aria-label="View"
                  title="View details"
                >
                  <ViewIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto overflow-y-auto min-h-0">
          <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
            <thead>
              <tr className="text-left text-secondary border-b border-gray-200">
                <th className="pb-3 pr-4 pl-2 font-semibold">Name</th>
                <th className="pb-3 pr-4 font-semibold text-center">90-day Points</th>
                <th className="pb-3 pr-4 font-semibold text-center">Most Recent</th>
                <th className="pb-3 pr-4 font-semibold text-center">Status</th>
                <th className="pb-3 pr-4 font-semibold text-center">E-Sign Status</th>
                <th className="pb-3 pr-2 font-semibold text-center">View</th>
              </tr>
            </thead>
            <tbody className="text-primary">
              {rows.map((row, index) => (
                <tr
                  key={`${row.name}-${row.role}-${index}`}
                  className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                >
                  <td className="py-3 pr-4 pl-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full bg-button-primary text-white flex items-center justify-center text-sm font-semibold shrink-0"
                        aria-hidden
                      >
                        {getInitial(row.name)}
                      </div>
                      <div>
                        <div className="font-semibold text-primary">{row.name}</div>
                        <div className="text-primary text-[10px] text-[8px] md:text-[10px] 2xl:text-xs">{row.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className={`py-3 pr-4 font-bold text-center ${pointsColorClass(row.status)}`}>
                    {row.points90Day}
                  </td>
                  <td className="py-3 pr-4 text-center">{row.mostRecent}</td>
                  <td className="py-3 pr-4 text-center">
                    <span className={statusPillClass[row.status]}>
                      {row.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-center">
                    <div className="flex items-center gap-1.5 justify-center">
                      {row.eSignStatus.type === 'pending' ? (
                        <>
                          <PendingIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5 shrink-0 text-pending" aria-hidden />
                          <span className="text-pending font-semibold">{row.eSignStatus.count} Pending</span>
                        </>
                      ) : (
                        <>
                          <CompliantIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5 shrink-0 text-positive" aria-hidden />
                          <span className="text-positive font-semibold">Compliant</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-2 text-center">
                    <button
                      type="button"
                      onClick={() => onView?.(row, index)}
                      className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors inline-flex items-center justify-center"
                      aria-label="View"
                      title="View details"
                    >
                      <ViewIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          </>
        )}
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

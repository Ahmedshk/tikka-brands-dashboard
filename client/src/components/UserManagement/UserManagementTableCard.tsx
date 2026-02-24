import type { UserRow, UserStatus } from '../../types/userManagement.types';
import { Pagination } from '../common/Pagination';
import EditIcon from '@assets/icons/edit.svg?react';
import DeleteIcon from '@assets/icons/delete.svg?react';

export interface UserManagementTableCardPagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

const statusPillClass: Record<UserStatus, string> = {
  Active: 'rounded-full px-2 py-0.5 text-[8px] md:text-[10px] 2xl:text-xs font-medium bg-[rgba(93,197,79,0.2)] text-primary',
  Suspended: 'rounded-full px-2 py-0.5 text-[8px] md:text-[10px] 2xl:text-xs font-medium bg-[rgba(253,185,14,0.2)] text-primary',
};

function getInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed[0]?.toUpperCase() ?? '?';
}

export interface UserManagementTableCardProps {
  rows: UserRow[];
  onAddUser?: () => void;
  onEdit?: (row: UserRow, index: number) => void;
  onDelete?: (row: UserRow, index: number) => void;
  pagination?: UserManagementTableCardPagination;
}

export const UserManagementTableCard = ({
  rows,
  onAddUser: _onAddUser,
  onEdit,
  onDelete,
  pagination,
}: UserManagementTableCardProps) => {
  return (
    <div className={`${cardClass} flex flex-col min-h-0 overflow-hidden`}>
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto min-h-0">
          <table className="w-full border-collapse table-fixed min-w-[32rem] text-[10px] md:text-xs 2xl:text-sm">
            <thead>
              <tr className="bg-button-primary text-white">
                <th className="w-[20%] text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">Name</th>
                <th className="w-[25%] text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4 text-center">Email</th>
                <th className="w-[20%] text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4 text-center">Role</th>
                <th className="w-[15%] text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4 text-center">Status</th>
                <th className="text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="text-primary">
              {rows.map((row, index) => (
                <tr
                  key={`${row.name}-${row.email}-${index}`}
                  className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                >
                  <td className="w-[20%] px-4 lg:px-6 py-3 lg:py-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full bg-button-primary text-white flex items-center justify-center text-sm font-semibold shrink-0"
                        aria-hidden
                      >
                        {getInitial(row.name)}
                      </div>
                      <span className="font-medium text-primary truncate" title={row.name}>{row.name}</span>
                    </div>
                  </td>
                  <td className="w-[25%] px-4 lg:px-6 py-3 lg:py-4 text-primary truncate text-center" title={row.email}>{row.email}</td>
                  <td className="w-[20%] px-4 lg:px-6 py-3 lg:py-4 truncate text-center" title={row.role}>{row.role}</td>
                  <td className="w-[15%] px-4 lg:px-6 py-3 lg:py-4 text-center">
                    <span className={statusPillClass[row.status]}>{row.status}</span>
                  </td>
                  <td className="px-4 lg:px-6 py-3 lg:py-4 text-center">
                    <div className="flex items-center justify-center gap-1 md:gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit?.(row, index)}
                        className="p-1.5 text-secondary hover:text-primary rounded"
                        aria-label="Edit"
                        title="Edit user"
                      >
                        <EditIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete?.(row, index)}
                        className="p-1.5 text-secondary hover:text-primary rounded"
                        aria-label="Delete"
                        title="Delete user"
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

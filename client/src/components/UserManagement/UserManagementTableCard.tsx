import type { UserRow, UserStatus } from '../../types/userManagement.types';
import { Pagination } from '../common/Pagination';
import EditIcon from '@assets/icons/edit.svg?react';
import DeleteIcon from '@assets/icons/delete.svg?react';
import { FaPaperPlane } from 'react-icons/fa';

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
  Pending: 'rounded-full px-2 py-0.5 text-[8px] md:text-[10px] 2xl:text-xs font-medium bg-[rgba(253,185,14,0.2)] text-primary',
  Suspended: 'rounded-full px-2 py-0.5 text-[8px] md:text-[10px] 2xl:text-xs font-medium bg-[rgba(253,185,14,0.2)] text-primary',
};

function getInitial(name: string | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed[0]?.toUpperCase() ?? '?';
}

function hasModifiedPermissionsOrLocations(row: UserRow): boolean {
  const hasPermissionOverrides =
    row.permissionOverrides?.type === 'custom' &&
    Array.isArray(row.permissionOverrides.pages) &&
    row.permissionOverrides.pages.length > 0;
  const hasPermissionRemovals =
    row.permissionRemovals?.type === 'custom' &&
    Array.isArray(row.permissionRemovals.pages) &&
    row.permissionRemovals.pages.length > 0;
  const hasLocationOverrides = Array.isArray(row.locationOverrides) && row.locationOverrides.length > 0;
  const hasLocationRemovals = Array.isArray(row.locationRemovals) && row.locationRemovals.length > 0;
  return hasPermissionOverrides || hasPermissionRemovals || hasLocationOverrides || hasLocationRemovals;
}

export interface UserManagementTableCardProps {
  rows: UserRow[];
  onAddUser?: () => void;
  onEdit?: (row: UserRow, index: number) => void;
  onDelete?: (row: UserRow, index: number) => void;
  onResendInvite?: (row: UserRow) => void;
  pagination?: UserManagementTableCardPagination;
}

function UserRowCard({
  row,
  index,
  onEdit,
  onDelete,
  onResendInvite,
}: Readonly<{
  row: UserRow;
  index: number;
  onEdit?: (row: UserRow, index: number) => void;
  onDelete?: (row: UserRow, index: number) => void;
  onResendInvite?: (row: UserRow) => void;
}>) {
  const displayName =
    (row.name ?? [row.firstName, row.lastName].filter(Boolean).join(' ').trim()) || row.email || '—';
  const cardBg = index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
  return (
    <div className={`${cardBg} px-4 py-4 flex flex-col gap-3`}>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-primary truncate" title={displayName}>
          {row.profileImageUrl ? (
            <img
              src={row.profileImageUrl}
              alt=""
              className="w-8 h-8 rounded-full object-cover shrink-0 bg-gray-100"
            />
          ) : (
            <span className="w-8 h-8 rounded-full bg-button-primary text-white flex items-center justify-center text-sm font-semibold shrink-0">
              {getInitial(displayName)}
            </span>
          )}
          <span className="truncate">{displayName}</span>
        </p>
        <p className="text-xs text-gray-600 mt-1 truncate" title={row.email}>
          <span className="font-medium">Email:</span> {row.email}
        </p>
        <p className="text-xs text-gray-600 mt-0.5 flex flex-wrap items-center gap-1">
          <span className="font-medium">Role:</span>
          <span>{row.role ?? 'Role unassigned'}</span>
          {hasModifiedPermissionsOrLocations(row) && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-200 text-gray-700">
              Modified
            </span>
          )}
        </p>
        <p className="text-xs text-gray-600 mt-0.5">
          <span className="font-medium">Status:</span>{' '}
          <span className={statusPillClass[row.status]}>{row.status}</span>
        </p>
      </div>
      <div className="flex items-center justify-end gap-1">
        {row.status === 'Pending' && onResendInvite && (
          <button
            type="button"
            onClick={() => onResendInvite(row)}
            className="p-2.5 text-primary hover:bg-gray-200 rounded-lg transition-colors touch-manipulation"
            aria-label={row.invitationSentAt ? 'Resend invitation' : 'Send invitation'}
            title={row.invitationSentAt ? 'Resend invitation' : 'Send invitation'}
          >
            <FaPaperPlane className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onEdit?.(row, index)}
          className="p-2.5 text-primary hover:bg-gray-200 rounded-lg transition-colors touch-manipulation"
          aria-label="Edit"
          title="Edit user"
        >
          <EditIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete?.(row, index)}
          className="p-2.5 text-primary hover:bg-gray-200 rounded-lg transition-colors touch-manipulation"
          aria-label="Delete"
          title="Delete user"
        >
          <DeleteIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export const UserManagementTableCard = ({
  rows,
  onAddUser: _onAddUser,
  onEdit,
  onDelete,
  onResendInvite,
  pagination,
}: UserManagementTableCardProps) => {
  return (
    <div className={`${cardClass} flex flex-col min-h-0 overflow-hidden`}>
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* Mobile: card list */}
        <div className="md:hidden divide-y divide-gray-200 overflow-y-auto min-h-0">
          {rows.map((row, index) => (
            <UserRowCard
              key={row._id}
              row={row}
              index={index}
              onEdit={onEdit}
              onDelete={onDelete}
              onResendInvite={onResendInvite}
            />
          ))}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto overflow-y-auto min-h-0">
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
              {rows.map((row, index) => {
                const displayName =
                  (row.name ?? [row.firstName, row.lastName].filter(Boolean).join(' ').trim()) || row.email || '—';
                return (
                <tr
                  key={row._id}
                  className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                >
                  <td className="w-[20%] px-4 lg:px-6 py-3 lg:py-4">
                    <div className="flex items-center gap-2">
                      {row.profileImageUrl ? (
                        <img
                          src={row.profileImageUrl}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover shrink-0 bg-gray-100"
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full bg-button-primary text-white flex items-center justify-center text-sm font-semibold shrink-0"
                          aria-hidden
                        >
                          {getInitial(displayName)}
                        </div>
                      )}
                      <span className="font-medium text-primary truncate" title={displayName}>{displayName}</span>
                    </div>
                  </td>
                  <td className="w-[25%] px-4 lg:px-6 py-3 lg:py-4 text-primary truncate text-center" title={row.email}>{row.email}</td>
                  <td className="w-[20%] px-4 lg:px-6 py-3 lg:py-4 text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <span className="truncate" title={row.role ?? 'Role unassigned'}>
                        {row.role ?? 'Role unassigned'}
                      </span>
                      {hasModifiedPermissionsOrLocations(row) && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-200 text-gray-700 shrink-0">
                          Modified
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="w-[15%] px-4 lg:px-6 py-3 lg:py-4 text-center">
                    <span className={statusPillClass[row.status]}>{row.status}</span>
                  </td>
                  <td className="px-4 lg:px-6 py-3 lg:py-4 text-center">
                    <div className="flex items-center justify-center gap-1 md:gap-2">
                      {row.status === 'Pending' && onResendInvite && (
                        <button
                          type="button"
                          onClick={() => onResendInvite(row)}
                          className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors"
                          aria-label={row.invitationSentAt ? 'Resend invitation' : 'Send invitation'}
                          title={row.invitationSentAt ? 'Resend invitation' : 'Send invitation'}
                        >
                          <FaPaperPlane className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onEdit?.(row, index)}
                        className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors"
                        aria-label="Edit"
                        title="Edit user"
                      >
                        <EditIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete?.(row, index)}
                        className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors"
                        aria-label="Delete"
                        title="Delete user"
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

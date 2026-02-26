import type { RoleRow, RolePermissions, RoleLocationsResponse } from '../../types/rbac.types';
import { Pagination } from '../common/Pagination';
import EditIcon from '@assets/icons/edit.svg?react';
import DeleteIcon from '@assets/icons/delete.svg?react';
import { FaCopy } from 'react-icons/fa';

export interface RBACTableCardPagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

function formatPermissions(permissions: RolePermissions): { summary: string; title?: string } {
  if (permissions.type === 'all') {
    return { summary: 'All' };
  }
  const pages = permissions.pages;
  const count = pages.length;
  const pageWord = count === 1 ? 'page' : 'pages';
  const summary = count === 0 ? 'None' : `Custom (${count} ${pageWord})`;
  const title = count > 0 ? pages.map((p) => p.pageLabel).join(', ') : undefined;
  return { summary, title };
}

/** Returns location display lines (one entry = one line in the UI). */
function getLocationLines(locations: RoleLocationsResponse | undefined): string[] {
  if (locations == null || locations === 'all') return ['All'];
  if (!Array.isArray(locations)) return ['All'];
  const n = locations.length;
  if (n === 0) return ['None'];
  const withNames = locations.every(
    (item): item is { _id: string; storeName: string } =>
      typeof item === 'object' && item != null && 'storeName' in item
  );
  if (withNames) {
    const names = locations.map((loc) => loc.storeName || '—').filter(Boolean);
    return names.length > 0 ? names : [n === 1 ? '1 location' : `${n} locations`];
  }
  return [n === 1 ? '1 location' : `${n} locations`];
}

export interface RBACTableCardProps {
  rows: RoleRow[];
  onEdit?: (row: RoleRow, index: number) => void;
  onDelete?: (row: RoleRow, index: number) => void;
  onDuplicate?: (row: RoleRow, index: number) => void;
  pagination?: RBACTableCardPagination;
}

export const RBACTableCard = ({
  rows,
  onEdit,
  onDelete,
  onDuplicate,
  pagination,
}: RBACTableCardProps) => {
  return (
    <div className={`${cardClass} flex flex-col min-h-0 overflow-hidden`}>
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* Mobile: card list */}
        <div className="md:hidden divide-y divide-gray-200">
          {rows.map((row, index) => {
            const { summary, title } = formatPermissions(row.permissions);
            const isSystem = row.isSystem === true;
            const isInactive = row.isActive === false;
            const cardBg = index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
            return (
              <div
                key={row.id ?? `${row.roleName}-${index}`}
                className={`${cardBg} px-4 py-4 sm:px-5 sm:py-4 flex flex-col gap-3`}
              >
                <div className="min-w-0 space-y-2">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-primary">
                    <span className="truncate" title={row.roleName}>
                      {row.roleName}
                    </span>
                    {isSystem && (
                      <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-800">
                        System
                      </span>
                    )}
                    {isInactive && (
                      <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-200 text-secondary">
                        Inactive
                      </span>
                    )}
                  </p>
                  <div className="text-xs text-secondary">
                    <span className="font-medium text-primary">Locations:</span>
                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {getLocationLines(row.locations).map((line, i) => (
                        <span key={i} className="block break-words">
                          {line}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-secondary" title={title ?? summary}>
                    <span className="font-medium text-primary">Permissions:</span> {summary}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-0 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit?.(row, index)}
                    disabled={isSystem}
                    className="p-2.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Edit role"
                    title="Edit role"
                  >
                    <EditIcon className="w-4 h-4 text-primary" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicate?.(row, index)}
                    disabled={isInactive}
                    className="p-2.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Duplicate role"
                    title="Duplicate role"
                  >
                    <FaCopy className="w-4 h-4 text-primary" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete?.(row, index)}
                    disabled={isSystem}
                    className="p-2.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Delete role"
                    title="Delete role"
                  >
                    <DeleteIcon className="w-4 h-4 text-primary" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto overflow-y-auto min-h-0">
          <table className="w-full border-collapse table-fixed min-w-[32rem] text-[10px] md:text-xs 2xl:text-sm">
            <thead>
              <tr className="bg-button-primary text-white">
                <th className="w-[25%] text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">
                  Role
                </th>
                <th className="w-[45%] text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">
                  Locations
                </th>
                <th className="w-[15%] text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">
                  Permissions
                </th>
                <th className="text-right text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="text-primary">
              {rows.map((row, index) => {
                const { summary, title } = formatPermissions(row.permissions);
                const isSystem = row.isSystem === true;
                const isInactive = row.isActive === false;
                return (
                  <tr
                    key={row.id ?? `${row.roleName}-${index}`}
                    className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                  >
                    <td className="w-[25%] px-4 lg:px-6 py-3 lg:py-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-primary truncate" title={row.roleName}>
                          {row.roleName}
                        </span>
                        {isSystem && (
                          <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-800">
                            System
                          </span>
                        )}
                        {isInactive && (
                          <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-200 text-secondary">
                            Inactive
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="w-[45%] px-4 lg:px-6 py-3 lg:py-4 text-secondary align-top">
                      <div className="flex flex-col gap-0.5">
                        {getLocationLines(row.locations).map((line, i) => (
                          <span key={i} className="block break-words">
                            {line}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="w-[15%] px-4 lg:px-6 py-3 lg:py-4 align-middle">
                      <span
                        className="text-secondary truncate block"
                        title={title ?? summary}
                      >
                        {summary}
                      </span>
                    </td>
                    <td className="px-4 lg:px-6 py-3 lg:py-4 text-right">
                      <div className="flex items-center justify-end gap-1 md:gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit?.(row, index)}
                          disabled={isSystem}
                          className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Edit role"
                          title="Edit role"
                        >
                          <EditIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicate?.(row, index)}
                          disabled={isInactive}
                          className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Duplicate role"
                          title="Duplicate role"
                        >
                          <FaCopy className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete?.(row, index)}
                          disabled={isSystem}
                          className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Delete role"
                          title="Delete role"
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

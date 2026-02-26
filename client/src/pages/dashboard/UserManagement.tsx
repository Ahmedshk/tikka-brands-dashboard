import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../../components/common/Layout';
import { UserManagementTableCard, AddUserModal, SyncSquareModal } from '../../components/UserManagement';
import { ConfirmDialog } from '../../components/modal/ConfirmDialog';
import type { UserRow } from '../../types/userManagement.types';
import { userService } from '../../services/user.service';
import { roleService } from '../../services/role.service';
import { locationService } from '../../services/location.service';
import type { RoleRow } from '../../types/rbac.types';
import type { Location } from '../../types';
import AdminSettingsIcon from '@assets/icons/admin_and_settings.svg?react';
import AddIcon from '@assets/icons/add.svg?react';
import SyncIcon from '@assets/icons/sync.svg?react';
import SearchIcon from '@assets/icons/search.svg?react';
import toast from 'react-hot-toast';
import { Spinner } from '../../components/common/Spinner';
import { FilterSelect } from '../../components/common/FilterSelect';

const PAGE_SIZE = 10;

export const UserManagement = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleIdFilter, setRoleIdFilter] = useState('');
  const [locationIdFilter, setLocationIdFilter] = useState('');
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserRow | null>(null);
  const [userToResendInvite, setUserToResendInvite] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [syncSquareOpen, setSyncSquareOpen] = useState(false);

  const [pagination, setPagination] = useState({
    totalItems: 0,
    totalPages: 1,
    page: 1,
    pageSize: PAGE_SIZE,
  });

  const fetchUsers = useCallback(
    async (requestedPage: number) => {
      setLoading(true);
      try {
        const result = await userService.listUsers({
          search: search.trim() || undefined,
          roleId: roleIdFilter.trim() || undefined,
          locationId: locationIdFilter.trim() || undefined,
          page: requestedPage,
          pageSize: PAGE_SIZE,
        });
        setUsers(result.users);
        setPagination(result.pagination);
      } catch {
        setUsers([]);
        setPagination((prev) => ({ ...prev, totalItems: 0, totalPages: 1 }));
        toast.error('Failed to load users');
      } finally {
        setLoading(false);
      }
    },
    [search, roleIdFilter, locationIdFilter]
  );

  // Refetch from backend when search or filters change (resets to page 1)
  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  useEffect(() => {
    roleService.list().then(setRoles).catch(() => setRoles([]));
    locationService.getAll().then(setLocations).catch(() => setLocations([]));
  }, []);

  const handleSyncSynced = (result: { created: number; updated: number }) => {
    fetchUsers(1);
    toast.success(`Synced from Square: ${result.created} created, ${result.updated} updated.`);
  };

  const handleEdit = (row: UserRow) => {
    setEditUser(row);
    setAddUserOpen(true);
  };

  const handleCloseAddModal = () => {
    setAddUserOpen(false);
    setEditUser(null);
  };

  const handleSaved = () => {
    fetchUsers(1);
    toast.success(editUser ? 'User updated successfully.' : 'User created successfully.');
    handleCloseAddModal();
  };

  const handleConfirmResendInvite = async () => {
    if (!userToResendInvite?._id) return;
    setSendingInvite(true);
    try {
      await userService.resendInvite(userToResendInvite._id);
      setUserToResendInvite(null);
      fetchUsers(pagination.page);
      toast.success(userToResendInvite.invitationSentAt ? 'Invitation resent.' : 'Invitation sent.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setSendingInvite(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete?._id) return;
    setDeleting(true);
    try {
      await userService.deleteUser(userToDelete._id);
      setUserToDelete(null);
      fetchUsers(pagination.page);
      toast.success('User deleted successfully.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <AdminSettingsIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            User Management
          </h2>
          <div className="flex w-full sm:w-auto flex-row gap-2 sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => setSyncSquareOpen(true)}
              className="w-[55%] min-w-0 sm:w-auto sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-300 bg-white text-secondary text-xs md:text-sm 2xl:text-base font-medium hover:bg-gray-50 transition-colors"
            >
              <SyncIcon className="w-4 h-4 shrink-0" aria-hidden />
              <span className="truncate">Sync from Square</span>
            </button>
            <button
              type="button"
              onClick={() => setAddUserOpen(true)}
              className="w-[45%] min-w-0 sm:w-auto sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-xs md:text-sm 2xl:text-base font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              <AddIcon className="w-4 h-4 shrink-0" aria-hidden />
              <span className="truncate">Add User</span>
            </button>
          </div>
        </div>

        {/* Search and filters – all trigger backend fetch; one row from sm up */}
        <div className="mb-4 flex flex-col sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between sm:gap-2 md:gap-3 gap-3">
          <div className="relative w-full sm:min-w-0 sm:max-w-[8rem] md:max-w-[14rem] lg:max-w-[16rem]">
            <SearchIcon
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary pointer-events-none shrink-0"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-primary text-sm bg-white placeholder:text-primary focus:outline-none focus:ring-2 focus:ring-gray-300/50"
              aria-label="Search users"
            />
          </div>
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-2 md:gap-3 sm:shrink-0">
            <div className="w-full sm:w-24 md:w-52 lg:w-60 xl:w-74 2xl:w-80 min-w-0">
              <FilterSelect
                value={locationIdFilter}
                onChange={setLocationIdFilter}
                options={locations.map((loc) => ({ value: loc._id, label: loc.storeName }))}
                placeholder="All locations"
                aria-label="Filter by location"
              />
            </div>
            <div className="w-full sm:w-24 md:w-52 lg:w-60 xl:w-74 2xl:w-80 min-w-0">
              <FilterSelect
                value={roleIdFilter}
                onChange={setRoleIdFilter}
                options={roles.map((r) => ({ value: r.id ?? '', label: r.roleName }))}
                placeholder="All roles"
                aria-label="Filter by role"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4 text-primary">
            <Spinner size="xl" className="text-button-primary" />
            <span className="text-sm">Loading users…</span>
          </div>
        ) : (
          <UserManagementTableCard
            rows={users}
            onEdit={handleEdit}
            onDelete={(row) => setUserToDelete(row)}
            onResendInvite={(row) => setUserToResendInvite(row)}
            pagination={{
              currentPage: pagination.page,
              totalPages: pagination.totalPages,
              totalItems: pagination.totalItems,
              pageSize: pagination.pageSize,
              onPageChange: (newPage) => { void fetchUsers(newPage); },
            }}
          />
        )}

        <AddUserModal
          open={addUserOpen}
          onClose={handleCloseAddModal}
          onSaved={handleSaved}
          onError={(msg) => toast.error(msg)}
          initialUser={editUser}
        />
        {userToDelete != null && (
          <ConfirmDialog
            isOpen
            onClose={() => setUserToDelete(null)}
            title="Delete user"
            message={`Are you sure you want to delete "${userToDelete.name || userToDelete.email}"? This cannot be undone.`}
            confirmLabel="Delete"
            cancelLabel="Cancel"
            onConfirm={handleConfirmDelete}
            variant="danger"
            isLoading={deleting}
          />
        )}
        {userToResendInvite != null && (
          <ConfirmDialog
            isOpen
            onClose={() => setUserToResendInvite(null)}
            title="Send invitation"
            message={`An invitation email with a temporary password will be sent to ${userToResendInvite.email}. Continue?`}
            confirmLabel="Send invitation"
            cancelLabel="Cancel"
            onConfirm={handleConfirmResendInvite}
            isLoading={sendingInvite}
          />
        )}
        <SyncSquareModal
          open={syncSquareOpen}
          onClose={() => setSyncSquareOpen(false)}
          onSynced={handleSyncSynced}
          onError={(msg) => toast.error(msg)}
        />
      </div>
    </Layout>
  );
};

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/common/Layout';
import { RBACTableCard, AddEditRoleModal } from '../../components/RBAC';
import type { RoleRow } from '../../types/rbac.types';
import { roleService } from '../../services/role.service';
import AdminSettingsIcon from '@assets/icons/admin_and_settings.svg?react';
import AddIcon from '@assets/icons/add.svg?react';
import toast from 'react-hot-toast';
import { Spinner } from '../../components/common/Spinner';

const PAGE_SIZE = 10;

export const RBACManagement = () => {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialRole, setModalInitialRole] = useState<RoleRow | null>(null);
  const [modalIsDuplicate, setModalIsDuplicate] = useState(false);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await roleService.list(false);
      setRoles(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load roles';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const totalPages = Math.ceil(roles.length / PAGE_SIZE) || 1;
  const paginatedRows = useMemo(
    () => roles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [roles, page]
  );

  const openAdd = () => {
    setModalInitialRole(null);
    setModalIsDuplicate(false);
    setModalOpen(true);
  };

  const openEdit = (row: RoleRow) => {
    setModalInitialRole(row);
    setModalIsDuplicate(false);
    setModalOpen(true);
  };

  const openDuplicate = (row: RoleRow) => {
    setModalInitialRole(row);
    setModalIsDuplicate(true);
    setModalOpen(true);
  };

  const handleSaved = () => {
    fetchRoles();
    setModalOpen(false);
    toast.success('Role saved successfully.');
  };

  const handleModalError = (message: string) => {
    toast.error(message);
  };

  const handleDelete = async (row: RoleRow, _index: number) => {
    if (!row.id) return;
    if (row.isSystem) {
      toast.error('Cannot delete system role.');
      return;
    }
    try {
      const result = await roleService.delete(row.id);
      await fetchRoles();
      if (result.deactivated) {
        toast.success('Role deactivated (in use by one or more users).');
      } else {
        toast.success('Role deleted successfully.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete role';
      toast.error(msg);
    }
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <AdminSettingsIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            RBAC Management
          </h2>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-xs md:text-sm 2xl:text-base font-medium hover:opacity-90 transition-opacity cursor-pointer"
            title="Add new role"
          >
            <AddIcon className="w-4 h-4 shrink-0" aria-hidden />
            Add Role
          </button>
        </div>

        {error && (
          <p className="mb-4 text-sm text-negative" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4 text-primary">
            <Spinner size="xl" className="text-button-primary" />
            <span className="text-sm">Loading roles…</span>
          </div>
        ) : (
          <RBACTableCard
            rows={paginatedRows}
            onEdit={openEdit}
            onDelete={handleDelete}
            onDuplicate={openDuplicate}
            pagination={{
              currentPage: page,
              totalPages,
              totalItems: roles.length,
              pageSize: PAGE_SIZE,
              onPageChange: setPage,
            }}
          />
        )}

        <AddEditRoleModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          initialRole={modalInitialRole}
          isDuplicate={modalIsDuplicate}
          onSaved={handleSaved}
          onError={handleModalError}
        />
      </div>
    </Layout>
  );
};

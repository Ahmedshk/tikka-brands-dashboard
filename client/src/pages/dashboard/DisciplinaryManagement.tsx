import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Layout } from '../../components/common/Layout';
import { CommandCenterKPICards } from '../../components/CommandCenter';
import { DisciplinaryToolbar, DisciplinaryTableCard } from '../../components/DisciplinaryManagement';
import { disciplinaryManagementService } from '../../services/disciplinaryManagement.service';
import type { RootState } from '../../store/store';
import type { DisciplinaryRow } from '../../types/disciplinaryManagement.types';
import TeamHrIcon from '@assets/icons/team_and_hr.svg?react';
import CriticalIcon from '@assets/icons/critical.svg?react';
import DisciplinaryReviewsDueIcon from '@assets/icons/disciplinary_reviews_due.svg?react';
import TotalTeamMembersIcon from '@assets/icons/total_team_members.svg?react';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;

export const DisciplinaryManagement = () => {
  const navigate = useNavigate();
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<DisciplinaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [criticalCount, setCriticalCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalActive, setTotalActive] = useState(0);

  useEffect(() => {
    const timeout = globalThis.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => globalThis.clearTimeout(timeout);
  }, [search]);

  const fetchEmployees = useCallback(async () => {
    if (!currentLocation?._id) {
      setRows([]);
      setTotalItems(0);
      setTotalPages(1);
      setCriticalCount(0);
      setPendingCount(0);
      setTotalActive(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await disciplinaryManagementService.getEmployees(currentLocation._id, {
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch,
      });
      setRows(data.rows);
      setTotalItems(data.meta.total);
      setTotalPages(data.meta.totalPages);
      setCriticalCount(data.meta.criticalCount);
      setPendingCount(data.meta.pendingCount);
      setTotalActive(data.meta.totalActive);
      if (data.meta.page !== page) {
        setPage(data.meta.page);
      }
    } catch {
      toast.error('Failed to load employees');
      setRows([]);
      setTotalItems(0);
      setTotalPages(1);
      setCriticalCount(0);
      setPendingCount(0);
      setTotalActive(0);
    } finally {
      setLoading(false);
    }
  }, [currentLocation?._id, debouncedSearch, page]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const disciplinaryKPIs = [
    {
      title: 'Critical',
      value: `${criticalCount} Member${criticalCount === 1 ? '' : 's'}`,
      accentColor: 'red' as const,
      rightIcon: <CriticalIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      loading,
    },
    {
      title: 'Pending PIPs',
      value: `${pendingCount} PIP${pendingCount === 1 ? '' : 's'}`,
      accentColor: 'gold' as const,
      rightIcon: <DisciplinaryReviewsDueIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      loading,
    },
    {
      title: 'Total Team Members',
      value: `${totalActive} Active`,
      accentColor: 'blue' as const,
      rightIcon: <TotalTeamMembersIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      loading,
    },
  ];

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <TeamHrIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Disciplinary Management
          </h2>
        </div>

        <CommandCenterKPICards items={disciplinaryKPIs} />

        <DisciplinaryToolbar
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />

        <DisciplinaryTableCard
          rows={rows}
          loading={loading}
          onView={(row) => {
            if (row.id) {
              navigate(`/dashboard/disciplinary-management/${row.id}`);
            }
          }}
          pagination={{
            currentPage: page,
            totalPages,
            totalItems,
            pageSize: PAGE_SIZE,
            onPageChange: setPage,
          }}
        />
      </div>
    </Layout>
  );
};

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Layout } from '../../components/common/Layout';
import { CommandCenterKPICards } from '../../components/CommandCenter';
import { DisciplinaryToolbar, DisciplinaryTableCard } from '../../components/DisciplinaryManagement';
import type { RootState } from '../../store/store';
import TeamHrIcon from '@assets/icons/team_and_hr.svg?react';
import CriticalIcon from '@assets/icons/critical.svg?react';
import DisciplinaryReviewsDueIcon from '@assets/icons/disciplinary_reviews_due.svg?react';
import TotalTeamMembersIcon from '@assets/icons/total_team_members.svg?react';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';
import { useDisciplinaryManagementData } from '../../utils/disciplinaryManagementHooks';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;
const PAGE_ID = 'disciplinary-management';

export const DisciplinaryManagement = () => {
  const navigate = useNavigate();
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const allLocationsSelected = useSelector((state: RootState) => state.location.allLocationsSelected);
  const locationId = allLocationsSelected ? '__all__' : (currentLocation?._id ?? null);
  const canTotalTeamKpi = useCanAccessComponent(PAGE_ID, 'total-team-members-kpi');
  const canPendingPipsKpi = useCanAccessComponent(PAGE_ID, 'pending-pips-kpi');
  const canCriticalKpi = useCanAccessComponent(PAGE_ID, 'critical-kpi');
  const canDisciplinaryRecords = useCanAccessComponent(PAGE_ID, 'disciplinary-records');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const needsKpiData = canTotalTeamKpi || canPendingPipsKpi || canCriticalKpi;
  const {
    rows,
    tableLoading,
    kpiLoading,
    totalItems,
    totalPages,
    criticalCount,
    pendingCount,
    totalActive,
  } = useDisciplinaryManagementData({
    locationId,
    canDisciplinaryRecords,
    needsKpiData,
    debouncedSearch,
    page,
    setPage,
  });

  useEffect(() => {
    const timeout = globalThis.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => globalThis.clearTimeout(timeout);
  }, [search]);

  const disciplinaryKPIs = useMemo(
    () => {
      const items: Array<{
        title: string;
        value: string;
        accentColor: 'blue' | 'gold' | 'red';
        rightIcon: ReactNode;
        loading: boolean;
      }> = [];
      if (canTotalTeamKpi) {
        items.push({
          title: 'Total Team Members',
          value: `${totalActive} Active`,
          accentColor: 'blue',
          rightIcon: <TotalTeamMembersIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
          loading: kpiLoading,
        });
      }
      if (canPendingPipsKpi) {
        items.push({
          title: 'Pending PIPs',
          value: `${pendingCount} PIP${pendingCount === 1 ? '' : 's'}`,
          accentColor: 'gold',
          rightIcon: <DisciplinaryReviewsDueIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
          loading: kpiLoading,
        });
      }
      if (canCriticalKpi) {
        items.push({
          title: 'Critical',
          value: `${criticalCount} Member${criticalCount === 1 ? '' : 's'}`,
          accentColor: 'red',
          rightIcon: <CriticalIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
          loading: kpiLoading,
        });
      }
      return items;
    },
    [
      canTotalTeamKpi,
      canPendingPipsKpi,
      canCriticalKpi,
      totalActive,
      pendingCount,
      criticalCount,
      kpiLoading,
    ]
  );

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

        {disciplinaryKPIs.length > 0 ? <CommandCenterKPICards items={disciplinaryKPIs} /> : null}

        {canDisciplinaryRecords ? (
          <>
            <DisciplinaryToolbar
              searchValue={search}
              onSearchChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />

            <DisciplinaryTableCard
              rows={rows}
              loading={tableLoading}
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
          </>
        ) : null}
      </div>
    </Layout>
  );
};

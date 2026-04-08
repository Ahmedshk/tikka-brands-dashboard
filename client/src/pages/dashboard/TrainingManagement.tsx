import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { Layout } from '../../components/common/Layout';
import { CommandCenterKPICards } from '../../components/CommandCenter';
import { DisciplinaryToolbar } from '../../components/DisciplinaryManagement';
import { EmployeeTrainingCard } from '../../components/TrainingReviews';
import { AssignTrainingModal } from '../../components/modal/AssignTrainingModal';
import { EmployeeTrainingViewModal } from '../../components/modal/EmployeeTrainingViewModal';
import { EmployeeTrainingEditModal } from '../../components/modal/EmployeeTrainingEditModal';
import { ConfirmDialog } from '../../components/modal/ConfirmDialog';
import { trainingAssignmentService } from '../../services/trainingAssignment.service';
import { computeTrainingKpis } from '../../utils/trainingKpiHelpers';
import type { EmployeeTrainingRow } from '../../types/trainingReviews.types';
import TeamHrIcon from '@assets/icons/team_and_hr.svg?react';
import OfficeStaffIcon from '@assets/icons/office_staff.svg?react';
import TrainingCompletionIcon from '@assets/icons/training_completion.svg?react';
import OverdueIcon from '@assets/icons/overdue.svg?react';
import AddIcon from '@assets/icons/add.svg?react';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';
import { useTrainingHierarchyAllowed } from '../../hooks/useTrainingHierarchyAllowed';
import type { RootState } from '../../store/store';

const PAGE_ID = 'training-management';
const PAGE_SIZE = 10;

export const TrainingManagement = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const [page, setPage] = useState(1);
  const [assignTrainingModalOpen, setAssignTrainingModalOpen] = useState(false);
  const [viewAssignmentId, setViewAssignmentId] = useState<string | null>(null);
  const [editAssignmentId, setEditAssignmentId] = useState<string | null>(null);
  const [assignmentToDelete, setAssignmentToDelete] = useState<EmployeeTrainingRow | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState(false);
  const [assignmentRows, setAssignmentRows] = useState<EmployeeTrainingRow[]>([]);
  const [employeeTrainingSearchInput, setEmployeeTrainingSearchInput] = useState('');
  const [employeeTrainingSearchDebounced, setEmployeeTrainingSearchDebounced] = useState('');
  const [searchAssignmentRows, setSearchAssignmentRows] = useState<EmployeeTrainingRow[]>([]);
  const [searchAssignmentsLoading, setSearchAssignmentsLoading] = useState(false);

  /**
   * Single GET /trainings/assignments per change. When search is empty, same rows feed KPIs (assignmentRows) and table (searchAssignmentRows).
   * When search is non-empty, only the table list updates; KPIs keep the last full (unsearched) snapshot.
   */
  const loadAssignments = useCallback(
    async (signal?: AbortSignal) => {
      const id = currentLocation?._id;
      if (!id?.trim()) {
        setAssignmentRows([]);
        setSearchAssignmentRows([]);
        setSearchAssignmentsLoading(false);
        return;
      }
      const search = employeeTrainingSearchDebounced.trim();
      setSearchAssignmentsLoading(true);
      try {
        const { rows } = await trainingAssignmentService.listAssignments(id, {
          ...(search ? { search } : {}),
          signal,
        });
        if (signal?.aborted) return;
        setSearchAssignmentRows(rows);
        if (!search) {
          setAssignmentRows(rows);
        }
      } catch (e: unknown) {
        if (axios.isCancel(e) || (e as { code?: string })?.code === 'ERR_CANCELED') return;
        if (signal?.aborted) return;
        setSearchAssignmentRows([]);
        if (!search) {
          setAssignmentRows([]);
        }
      } finally {
        if (!signal?.aborted) setSearchAssignmentsLoading(false);
      }
    },
    [currentLocation?._id, employeeTrainingSearchDebounced],
  );

  const refreshAssignments = useCallback(() => {
    const ac = new AbortController();
    void loadAssignments(ac.signal);
  }, [loadAssignments]);

  useEffect(() => {
    setEmployeeTrainingSearchInput('');
    setEmployeeTrainingSearchDebounced('');
    setPage(1);
  }, [currentLocation?._id]);

  useEffect(() => {
    const t = globalThis.setTimeout(() => {
      setEmployeeTrainingSearchDebounced(employeeTrainingSearchInput.trim());
    }, 400);
    return () => globalThis.clearTimeout(t);
  }, [employeeTrainingSearchInput]);

  useEffect(() => {
    setPage(1);
  }, [employeeTrainingSearchDebounced]);

  useEffect(() => {
    const ac = new AbortController();
    void loadAssignments(ac.signal);
    return () => ac.abort();
  }, [loadAssignments]);

  const canStaffInTraining = useCanAccessComponent(PAGE_ID, 'kpi-office-staff');
  const canTrainingsOverdue = useCanAccessComponent(PAGE_ID, 'kpi-trainings-overdue');
  const canTrainingCompletion = useCanAccessComponent(PAGE_ID, 'kpi-training-completion');
  const canEmployeeTraining = useCanAccessComponent(PAGE_ID, 'employee-training');
  const { allowedRoleIds, allowedRoleNames, loading: hierarchyLoading } = useTrainingHierarchyAllowed();

  const filteredAssignmentRows = useMemo(() => {
    if (hierarchyLoading) return assignmentRows;
    if (allowedRoleNames.size === 0) return [];
    return assignmentRows.filter((row) => row.role !== '—' && allowedRoleNames.has(row.role));
  }, [assignmentRows, allowedRoleNames, hierarchyLoading]);

  const filteredTableRows = useMemo(() => {
    if (hierarchyLoading) return searchAssignmentRows;
    if (allowedRoleNames.size === 0) return [];
    return searchAssignmentRows.filter((row) => row.role !== '—' && allowedRoleNames.has(row.role));
  }, [searchAssignmentRows, allowedRoleNames, hierarchyLoading]);

  const searchMatchCount = searchAssignmentRows.length;
  const filteredTotal = filteredTableRows.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  const paginatedTableRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredTableRows.slice(start, start + PAGE_SIZE);
  }, [filteredTableRows, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const kpiValues = useMemo(() => computeTrainingKpis(filteredAssignmentRows), [filteredAssignmentRows]);

  const trainingKPIs = useMemo(() => {
    const items: Array<{
      title: string;
      value: string;
      accentColor: 'green' | 'red' | 'blue';
      rightIcon: React.ReactNode;
    }> = [];
    if (canStaffInTraining) {
      items.push({
        title: 'Staff in Training',
        value: String(kpiValues.staffInTraining),
        accentColor: 'blue',
        rightIcon: <OfficeStaffIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      });
    }
    if (canTrainingsOverdue) {
      items.push({
        title: 'Trainings Overdue',
        value: String(kpiValues.trainingsOverdue),
        accentColor: 'red',
        rightIcon: <OverdueIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-[#FF1C28]" />,
      });
    }
    if (canTrainingCompletion) {
      items.push({
        title: 'Training Completion',
        value: kpiValues.trainingCompletionPct,
        accentColor: 'green',
        rightIcon: <TrainingCompletionIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      });
    }
    return items;
  }, [canStaffInTraining, canTrainingsOverdue, canTrainingCompletion, kpiValues]);

  const tableLoading =
    Boolean(currentLocation?._id) && (searchAssignmentsLoading || hierarchyLoading);

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <TeamHrIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Training Management
          </h2>
        </div>

        {trainingKPIs.length > 0 ? (
          <div className="mb-6">
            <CommandCenterKPICards items={trainingKPIs} />
          </div>
        ) : null}

        {canEmployeeTraining ? (
          <>
            {!currentLocation && (
              <p className="text-secondary text-sm mb-2">Select a location in the navbar to see assignments.</p>
            )}
            <DisciplinaryToolbar
              searchValue={employeeTrainingSearchInput}
              onSearchChange={setEmployeeTrainingSearchInput}
              placeholder="Search by name…"
              searchAriaLabel="Search employee training by name"
              trailing={
                <button
                  type="button"
                  disabled={!currentLocation?._id}
                  onClick={() => setAssignTrainingModalOpen(true)}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-xs md:text-sm 2xl:text-base font-medium hover:opacity-90 transition-opacity cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Assign training"
                >
                  <AddIcon className="w-4 h-4" aria-hidden />
                  Assign Training
                </button>
              }
            />
            <EmployeeTrainingCard
              rows={paginatedTableRows}
              loading={tableLoading}
              debouncedSearch={employeeTrainingSearchDebounced}
              searchMatchCount={searchMatchCount}
              filteredTotal={filteredTotal}
              onView={(row) => setViewAssignmentId(row.assignmentId)}
              onEdit={(row) => setEditAssignmentId(row.assignmentId)}
              onDelete={(row) => setAssignmentToDelete(row)}
              pagination={
                filteredTotal > 0
                  ? {
                      currentPage: page,
                      totalPages,
                      totalItems: filteredTotal,
                      pageSize: PAGE_SIZE,
                      onPageChange: setPage,
                    }
                  : undefined
              }
            />
          </>
        ) : null}
      </div>

      <AssignTrainingModal
        isOpen={assignTrainingModalOpen}
        onClose={() => setAssignTrainingModalOpen(false)}
        locationId={currentLocation?._id ?? null}
        allowedRoleIds={allowedRoleIds}
        hierarchyLoading={hierarchyLoading}
        onAssigned={refreshAssignments}
      />
      <EmployeeTrainingViewModal
        isOpen={viewAssignmentId != null}
        onClose={() => setViewAssignmentId(null)}
        assignmentId={viewAssignmentId}
      />
      <EmployeeTrainingEditModal
        isOpen={editAssignmentId != null}
        onClose={() => setEditAssignmentId(null)}
        assignmentId={editAssignmentId}
        onUpdated={() => {
          setEditAssignmentId(null);
          refreshAssignments();
        }}
      />
      <ConfirmDialog
        isOpen={assignmentToDelete != null}
        onClose={() => setAssignmentToDelete(null)}
        title="Delete assignment"
        message={
          assignmentToDelete
            ? `Remove this training assignment for ${assignmentToDelete.assignTo}? Progress and notes will be lost.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={deletingAssignment}
        onConfirm={async () => {
          if (!assignmentToDelete) return;
          setDeletingAssignment(true);
          try {
            await trainingAssignmentService.deleteAssignment(assignmentToDelete.assignmentId);
            setAssignmentToDelete(null);
            refreshAssignments();
          } finally {
            setDeletingAssignment(false);
          }
        }}
      />
    </Layout>
  );
};

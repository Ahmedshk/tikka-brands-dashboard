import { useState, useMemo, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Layout } from '../../components/common/Layout';
import { CommandCenterKPICards } from '../../components/CommandCenter';
import { EmployeeTrainingCard, TrainingsCard } from '../../components/TrainingReviews';
import { EmployeeTrainingModal } from '../../components/modal/EmployeeTrainingModal';
import { TrainingsModal } from '../../components/modal/TrainingsModal';
import { CreateTrainingModal } from '../../components/modal/CreateTrainingModal';
import { EditTrainingModal } from '../../components/modal/EditTrainingModal';
import { AssignTrainingModal } from '../../components/modal/AssignTrainingModal';
import { EmployeeTrainingViewModal } from '../../components/modal/EmployeeTrainingViewModal';
import { EmployeeTrainingEditModal } from '../../components/modal/EmployeeTrainingEditModal';
import { ConfirmDialog } from '../../components/modal/ConfirmDialog';
import { trainingService } from '../../services/training.service';
import { trainingAssignmentService } from '../../services/trainingAssignment.service';
import { computeTrainingKpis } from '../../utils/trainingKpiHelpers';
import type { EmployeeTrainingRow, Training } from '../../types/trainingReviews.types';
import TeamHrIcon from '@assets/icons/team_and_hr.svg?react';
import OfficeStaffIcon from '@assets/icons/office_staff.svg?react';
import TrainingCompletionIcon from '@assets/icons/training_completion.svg?react';
import OverdueIcon from '@assets/icons/overdue.svg?react';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';
import { useTrainingHierarchyAllowed } from '../../hooks/useTrainingHierarchyAllowed';
import type { RootState } from '../../store/store';

const PAGE_ID = 'training-management';

export const TrainingManagement = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const [employeeTrainingModalOpen, setEmployeeTrainingModalOpen] = useState(false);
  const [trainingsModalOpen, setTrainingsModalOpen] = useState(false);
  const [createTrainingModalOpen, setCreateTrainingModalOpen] = useState(false);
  const [assignTrainingModalOpen, setAssignTrainingModalOpen] = useState(false);
  const [viewAssignmentId, setViewAssignmentId] = useState<string | null>(null);
  const [editAssignmentId, setEditAssignmentId] = useState<string | null>(null);
  const [assignmentToDelete, setAssignmentToDelete] = useState<EmployeeTrainingRow | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState(false);
  const [editTrainingId, setEditTrainingId] = useState<string | null>(null);
  const [trainingToDelete, setTrainingToDelete] = useState<Training | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [trainingsLoading, setTrainingsLoading] = useState(true);
  const [assignmentRows, setAssignmentRows] = useState<EmployeeTrainingRow[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(() => Boolean(currentLocation?._id));

  const refreshTrainings = () => {
    setTrainingsLoading(true);
    trainingService
      .list()
      .then(setTrainings)
      .catch(() => {})
      .finally(() => setTrainingsLoading(false));
  };

  const refreshAssignments = () => {
    if (!currentLocation?._id) {
      setAssignmentRows([]);
      setAssignmentsLoading(false);
      return;
    }
    setAssignmentsLoading(true);
    trainingAssignmentService
      .listAssignments(currentLocation._id)
      .then(setAssignmentRows)
      .catch(() => setAssignmentRows([]))
      .finally(() => setAssignmentsLoading(false));
  };

  useEffect(() => {
    setTrainingsLoading(true);
    trainingService
      .list()
      .then((list) => setTrainings(list))
      .catch(() => {})
      .finally(() => setTrainingsLoading(false));
  }, []);

  useEffect(() => {
    if (!currentLocation?._id) {
      setAssignmentRows([]);
      setAssignmentsLoading(false);
      return;
    }
    setAssignmentsLoading(true);
    trainingAssignmentService
      .listAssignments(currentLocation._id)
      .then(setAssignmentRows)
      .catch(() => setAssignmentRows([]))
      .finally(() => setAssignmentsLoading(false));
  }, [currentLocation?._id]);

  const canStaffInTraining = useCanAccessComponent(PAGE_ID, 'kpi-office-staff');
  const canTrainingsOverdue = useCanAccessComponent(PAGE_ID, 'kpi-trainings-overdue');
  const canTrainingCompletion = useCanAccessComponent(PAGE_ID, 'kpi-training-completion');
  const canEmployeeTraining = useCanAccessComponent(PAGE_ID, 'employee-training');
  const canTrainings = useCanAccessComponent(PAGE_ID, 'trainings');
  const { allowedRoleIds, allowedRoleNames, loading: hierarchyLoading } = useTrainingHierarchyAllowed();

  const filteredAssignmentRows = useMemo(() => {
    if (hierarchyLoading) return assignmentRows;
    if (allowedRoleNames.size === 0) return [];
    return assignmentRows.filter((row) => row.role !== '—' && allowedRoleNames.has(row.role));
  }, [assignmentRows, allowedRoleNames, hierarchyLoading]);

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

  return (
    <Layout>
      <div className="p-6 flex flex-col min-h-full">
        <div className="mb-6 flex-shrink-0">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <TeamHrIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Training Management
          </h2>
        </div>

        {trainingKPIs.length > 0 && (
          <div className="flex-shrink-0 mb-6">
            <CommandCenterKPICards items={trainingKPIs} />
          </div>
        )}

        {(canEmployeeTraining || canTrainings) && (
          <div
            className={
              canEmployeeTraining && canTrainings
                ? 'grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch flex-1 min-h-0'
                : 'grid grid-cols-1 gap-6 items-stretch flex-1 min-h-0'
            }
          >
            {canEmployeeTraining && (
              <div className={canTrainings ? 'lg:col-span-2 min-h-0 flex flex-col' : 'min-h-0 flex flex-col'}>
                {!currentLocation && (
                  <p className="text-secondary text-sm mb-2">Select a location in the navbar to see assignments.</p>
                )}
                <EmployeeTrainingCard
                  rows={filteredAssignmentRows}
                  loading={Boolean(currentLocation?._id) && (assignmentsLoading || hierarchyLoading)}
                  onAssignTraining={() => setAssignTrainingModalOpen(true)}
                  onViewAll={() => setEmployeeTrainingModalOpen(true)}
                  onView={(row) => setViewAssignmentId(row.assignmentId)}
                  onEdit={(row) => setEditAssignmentId(row.assignmentId)}
                  onDelete={(row) => setAssignmentToDelete(row)}
                />
              </div>
            )}
            {canTrainings && (
              <div className={canEmployeeTraining ? 'lg:col-span-1 min-h-0 flex flex-col' : 'min-h-0 flex flex-col'}>
                <TrainingsCard
                  trainings={trainings}
                  loading={trainingsLoading}
                  onEdit={(training) => setEditTrainingId(training.id)}
                  onDelete={(training) => setTrainingToDelete(training)}
                  onCreate={() => setCreateTrainingModalOpen(true)}
                  onViewAll={() => setTrainingsModalOpen(true)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <EmployeeTrainingModal
        isOpen={employeeTrainingModalOpen}
        onClose={() => setEmployeeTrainingModalOpen(false)}
        rows={filteredAssignmentRows}
        onView={(row) => setViewAssignmentId(row.assignmentId)}
        onEdit={(row) => setEditAssignmentId(row.assignmentId)}
        onDelete={(row) => setAssignmentToDelete(row)}
      />
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
      <TrainingsModal
        isOpen={trainingsModalOpen}
        onClose={() => setTrainingsModalOpen(false)}
        trainings={trainings}
        onEdit={(training) => {
          setTrainingsModalOpen(false);
          setEditTrainingId(training.id);
        }}
        onDelete={(training) => {
          setTrainingsModalOpen(false);
          setTrainingToDelete(training);
        }}
      />
      <CreateTrainingModal
        isOpen={createTrainingModalOpen}
        onClose={() => setCreateTrainingModalOpen(false)}
        onCreated={() => {
          setCreateTrainingModalOpen(false);
          refreshTrainings();
        }}
      />
      <EditTrainingModal
        trainingId={editTrainingId}
        isOpen={editTrainingId != null}
        onClose={() => setEditTrainingId(null)}
        onUpdated={() => {
          setEditTrainingId(null);
          refreshTrainings();
        }}
      />
      <ConfirmDialog
        isOpen={trainingToDelete != null}
        onClose={() => setTrainingToDelete(null)}
        title="Delete training"
        message={
          trainingToDelete
            ? `Delete training "${trainingToDelete.name}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={async () => {
          if (!trainingToDelete) return;
          setDeleting(true);
          try {
            await trainingService.delete(trainingToDelete.id);
            setTrainingToDelete(null);
            refreshTrainings();
          } finally {
            setDeleting(false);
          }
        }}
      />
    </Layout>
  );
};

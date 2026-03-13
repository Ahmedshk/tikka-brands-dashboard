import { useState, useMemo, useEffect } from 'react';
import { Layout } from '../../components/common/Layout';
import { CommandCenterKPICards } from '../../components/CommandCenter';
import { EmployeeTrainingCard, TrainingsCard } from '../../components/TrainingReviews';
import { EmployeeTrainingModal } from '../../components/modal/EmployeeTrainingModal';
import { TrainingsModal } from '../../components/modal/TrainingsModal';
import { CreateTrainingModal } from '../../components/modal/CreateTrainingModal';
import { trainingService } from '../../services/training.service';
import type { EmployeeTrainingRow, Training } from '../../types/trainingReviews.types';
import TeamHrIcon from '@assets/icons/team_and_hr.svg?react';
import OfficeStaffIcon from '@assets/icons/office_staff.svg?react';
import TrainingCompletionIcon from '@assets/icons/training_completion.svg?react';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';

const PAGE_ID = 'training-management';

const trainingManagementKPIItems = [
  {
    id: 'kpi-office-staff' as const,
    title: 'Office Staff',
    value: '36',
    accentColor: 'green' as const,
    rightIcon: <OfficeStaffIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
  },
  {
    id: 'kpi-training-completion' as const,
    title: 'Training Completion',
    value: '84%',
    accentColor: 'blue' as const,
    rightIcon: <TrainingCompletionIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
  },
];

const mockEmployeeTrainingRows: EmployeeTrainingRow[] = [
  { trainingName: 'Food Safety', assignTo: 'John Kevin', role: 'Store Manager', progress: 100, status: 'Complete', completedModules: 4, totalModules: 4 },
  { trainingName: 'POS Training', assignTo: 'Max Dupree', role: 'Shift Supervisor', progress: 100, status: 'Complete', completedModules: 4, totalModules: 4 },
  { trainingName: 'Customer Care', assignTo: 'Justin Gabrial', role: 'Cashier', progress: 60, status: 'Pending', completedModules: 1, totalModules: 3 },
  { trainingName: 'Customer Care', assignTo: 'JKane Doe', role: 'Delivery Driver', progress: 60, status: 'Pending', completedModules: 2, totalModules: 3 },
  { trainingName: 'Workplace Safety', assignTo: 'Falis Stones', role: 'Cook', progress: 60, status: 'Pending', completedModules: 2, totalModules: 5 },
];

const initialTrainings: Training[] = [
  { id: '1', name: 'Food Safety', moduleCount: 4 },
  { id: '2', name: 'POS Training', moduleCount: 4 },
  { id: '3', name: 'Customer Care', moduleCount: 3 },
  { id: '4', name: 'Workplace Safety', moduleCount: 5 },
];

export const TrainingManagement = () => {
  const [employeeTrainingModalOpen, setEmployeeTrainingModalOpen] = useState(false);
  const [trainingsModalOpen, setTrainingsModalOpen] = useState(false);
  const [createTrainingModalOpen, setCreateTrainingModalOpen] = useState(false);
  const [trainings, setTrainings] = useState<Training[]>(initialTrainings);

  useEffect(() => {
    trainingService
      .list()
      .then((list) => setTrainings(list))
      .catch(() => {});
  }, []);

  const canOfficeStaff = useCanAccessComponent(PAGE_ID, 'kpi-office-staff');
  const canTrainingCompletion = useCanAccessComponent(PAGE_ID, 'kpi-training-completion');
  const canEmployeeTraining = useCanAccessComponent(PAGE_ID, 'employee-training');
  const canTrainings = useCanAccessComponent(PAGE_ID, 'trainings');

  const trainingKPIs = useMemo(
    () =>
      trainingManagementKPIItems
        .filter(
          (item) =>
            (item.id === 'kpi-office-staff' && canOfficeStaff) ||
            (item.id === 'kpi-training-completion' && canTrainingCompletion)
        )
        .map(({ id, ...rest }) => rest),
    [canOfficeStaff, canTrainingCompletion]
  );

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
                <EmployeeTrainingCard
                  rows={mockEmployeeTrainingRows}
                  onAssignTraining={() => {}}
                  onViewAll={() => setEmployeeTrainingModalOpen(true)}
                />
              </div>
            )}
            {canTrainings && (
              <div className={canEmployeeTraining ? 'lg:col-span-1 min-h-0 flex flex-col' : 'min-h-0 flex flex-col'}>
                <TrainingsCard
                  trainings={trainings}
                  onView={() => {}}
                  onEdit={() => {}}
                  onDelete={() => {}}
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
        rows={mockEmployeeTrainingRows}
      />
      <TrainingsModal
        isOpen={trainingsModalOpen}
        onClose={() => setTrainingsModalOpen(false)}
        trainings={trainings}
      />
      <CreateTrainingModal
        isOpen={createTrainingModalOpen}
        onClose={() => setCreateTrainingModalOpen(false)}
        onCreated={() => {
          setCreateTrainingModalOpen(false);
          trainingService.list().then(setTrainings).catch(() => {});
        }}
      />
    </Layout>
  );
};

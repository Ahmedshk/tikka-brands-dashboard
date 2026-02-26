import { useState, useMemo } from 'react';
import { Layout } from '../../components/common/Layout';
import { CommandCenterKPICards } from '../../components/CommandCenter';
import {
  StaffListCard,
  ReviewTrackerCard,
  RecentlyCompletedReviewsCard,
  EmployeeTrainingCard,
} from '../../components/TrainingReviews';
import { StaffListModal } from '../../components/modal/StaffListModal';
import { RecentlyCompletedReviewsModal } from '../../components/modal/RecentlyCompletedReviewsModal';
import { EmployeeTrainingModal } from '../../components/modal/EmployeeTrainingModal';
import type { StaffListRow, RecentlyCompletedReviewItem, EmployeeTrainingRow } from '../../types/trainingReviews.types';
import TeamHrIcon from '@assets/icons/team_and_hr.svg?react';
import OfficeStaffIcon from '@assets/icons/office_staff.svg?react';
import ReviewsDueIcon from '@assets/icons/reviews_due.svg?react';
import TrainingCompletionIcon from '@assets/icons/training_completion.svg?react';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';

const PAGE_ID = 'training-reviews';

const trainingReviewsKPIItems = [
  { id: 'kpi-office-staff' as const, title: 'Office Staff', value: '36', accentColor: 'green' as const, rightIcon: <OfficeStaffIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" /> },
  { id: 'kpi-reviews-due' as const, title: 'Reviews Due', value: '5', accentColor: 'gold' as const, rightIcon: <ReviewsDueIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" /> },
  { id: 'kpi-training-completion' as const, title: 'Training Completion', value: '84%', accentColor: 'blue' as const, rightIcon: <TrainingCompletionIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" /> },
];

const mockStaffListRows: StaffListRow[] = [
  { name: 'John Kevin', role: 'Store Manager', hireDate: '05/15/2021', tenure: '2 yrs', reviewStatus: 'Complete' },
  { name: 'Max Dupree', role: 'Shift Supervisor', hireDate: '08/01/2022', tenure: '8 mo', reviewStatus: 'Due Soon' },
  { name: 'Justin Gabrial', role: 'Cashier', hireDate: '09/10/2023', tenure: '6 mo', reviewStatus: 'Complete' },
  { name: 'Falis Stones', role: 'Cook', hireDate: '01/20/2023', tenure: '2 yrs', reviewStatus: 'Over Due' },
  { name: 'Kane Doe', role: 'Delivery Driver', hireDate: '02/01/2021', tenure: '1 yrs', reviewStatus: 'Complete' },
];

const mockRecentlyCompletedReviews: RecentlyCompletedReviewItem[] = [
  { name: 'John Kevin', reviewType: 'Quarterly', status: 'Completed', completedDate: '08/05/2025' },
  { name: 'Max Dupree', reviewType: 'Annual', status: 'Completed', completedDate: '08/02/2025' },
  { name: 'Justin Gabrial', reviewType: 'Quarterly', status: 'Completed', completedDate: '07/28/2025' },
  { name: 'Falis Stones', reviewType: 'Annual', status: 'Completed', completedDate: '07/15/2025' },
  { name: 'Kane Doe', reviewType: 'Annual', status: 'Completed', completedDate: '07/10/2025' },
];

const mockEmployeeTrainingRows: EmployeeTrainingRow[] = [
  { trainingName: 'Food Safety', assignTo: 'John Kevin', progress: 100, status: 'Complete', completedModules: 4, totalModules: 4 },
  { trainingName: 'POS Training', assignTo: 'Max Dupree', progress: 100, status: 'Complete', completedModules: 4, totalModules: 4 },
  { trainingName: 'Customer Care', assignTo: 'Justin Gabrial', progress: 60, status: 'Pending', completedModules: 1, totalModules: 3 },
  { trainingName: 'Customer Care', assignTo: 'JKane Doe', progress: 60, status: 'Pending', completedModules: 2, totalModules: 3 },
  { trainingName: 'Workplace Safety', assignTo: 'Falis Stones', progress: 60, status: 'Pending', completedModules: 2, totalModules: 5 },
];

export const TrainingReviews = () => {
  const [staffListModalOpen, setStaffListModalOpen] = useState(false);
  const [recentlyCompletedModalOpen, setRecentlyCompletedModalOpen] = useState(false);
  const [employeeTrainingModalOpen, setEmployeeTrainingModalOpen] = useState(false);

  const canOfficeStaff = useCanAccessComponent(PAGE_ID, 'kpi-office-staff');
  const canReviewsDue = useCanAccessComponent(PAGE_ID, 'kpi-reviews-due');
  const canTrainingCompletion = useCanAccessComponent(PAGE_ID, 'kpi-training-completion');
  const canStaffList = useCanAccessComponent(PAGE_ID, 'staff-list');
  const canReviewTracker = useCanAccessComponent(PAGE_ID, 'review-tracker-chart');
  const canRecentlyCompleted = useCanAccessComponent(PAGE_ID, 'recently-completed-reviews');
  const canEmployeeTraining = useCanAccessComponent(PAGE_ID, 'employee-training');

  const trainingReviewsKPIs = useMemo(
    () => trainingReviewsKPIItems
      .filter((item) => (item.id === 'kpi-office-staff' && canOfficeStaff) || (item.id === 'kpi-reviews-due' && canReviewsDue) || (item.id === 'kpi-training-completion' && canTrainingCompletion))
      .map(({ id, ...rest }) => rest),
    [canOfficeStaff, canReviewsDue, canTrainingCompletion]
  );

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <TeamHrIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Training & Reviews
          </h2>
        </div>

        {trainingReviewsKPIs.length > 0 && <CommandCenterKPICards items={trainingReviewsKPIs} />}

        {(canStaffList || canReviewTracker) && (
          <div
            className={
              canStaffList && canReviewTracker
                ? 'grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 items-stretch'
                : 'grid grid-cols-1 gap-6 mb-6 items-stretch'
            }
          >
            {canStaffList && (
              <div className={canReviewTracker ? 'lg:col-span-2 min-h-0 flex flex-col' : 'min-h-0 flex flex-col'}>
                <StaffListCard rows={mockStaffListRows} onViewAll={() => setStaffListModalOpen(true)} />
              </div>
            )}
            {canReviewTracker && (
              <div className={canStaffList ? 'lg:col-span-1 min-h-0 flex flex-col' : 'min-h-0 flex flex-col'}>
                <ReviewTrackerCard completePercent={84} completeCount={15} dueCount={5} />
              </div>
            )}
          </div>
        )}

        {(canRecentlyCompleted || canEmployeeTraining) && (
          <div
            className={
              canRecentlyCompleted && canEmployeeTraining
                ? 'grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch'
                : 'grid grid-cols-1 gap-6 items-stretch'
            }
          >
            {canRecentlyCompleted && (
              <div className={canEmployeeTraining ? 'lg:col-span-1 min-h-0 flex flex-col' : 'min-h-0 flex flex-col'}>
                <RecentlyCompletedReviewsCard
                  items={mockRecentlyCompletedReviews}
                  onView={() => { }}
                  onViewAll={() => setRecentlyCompletedModalOpen(true)}
                />
              </div>
            )}
            {canEmployeeTraining && (
              <div className={canRecentlyCompleted ? 'lg:col-span-2 min-h-0 flex flex-col' : 'min-h-0 flex flex-col'}>
                <EmployeeTrainingCard
                  rows={mockEmployeeTrainingRows}
                  onUploadTrainingFile={() => { }}
                  onAssignTraining={() => { }}
                  onViewAll={() => setEmployeeTrainingModalOpen(true)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <StaffListModal
        isOpen={staffListModalOpen}
        onClose={() => setStaffListModalOpen(false)}
        rows={mockStaffListRows}
      />
      <RecentlyCompletedReviewsModal
        isOpen={recentlyCompletedModalOpen}
        onClose={() => setRecentlyCompletedModalOpen(false)}
        items={mockRecentlyCompletedReviews}
        onView={() => { }}
      />
      <EmployeeTrainingModal
        isOpen={employeeTrainingModalOpen}
        onClose={() => setEmployeeTrainingModalOpen(false)}
        rows={mockEmployeeTrainingRows}
      />
    </Layout>
  );
};

import { useState, useMemo } from 'react';
import { Layout } from '../../components/common/Layout';
import { CommandCenterKPICards } from '../../components/CommandCenter';
import {
  StaffListCard,
  ReviewTrackerCard,
  RecentlyCompletedReviewsCard,
} from '../../components/TrainingReviews';
import { StaffListModal } from '../../components/modal/StaffListModal';
import { RecentlyCompletedReviewsModal } from '../../components/modal/RecentlyCompletedReviewsModal';
import type { StaffListRow, RecentlyCompletedReviewItem } from '../../types/trainingReviews.types';
import TeamHrIcon from '@assets/icons/team_and_hr.svg?react';
import OfficeStaffIcon from '@assets/icons/office_staff.svg?react';
import ReviewsDueIcon from '@assets/icons/reviews_due.svg?react';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';

const PAGE_ID = 'reviews-management';

const reviewsKPIItems = [
  {
    id: 'kpi-office-staff' as const,
    title: 'Office Staff',
    value: '36',
    accentColor: 'green' as const,
    rightIcon: <OfficeStaffIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
  },
  {
    id: 'kpi-reviews-due' as const,
    title: 'Reviews Due',
    value: '5',
    accentColor: 'gold' as const,
    rightIcon: <ReviewsDueIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
  },
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

export const ReviewsManagement = () => {
  const [staffListModalOpen, setStaffListModalOpen] = useState(false);
  const [recentlyCompletedModalOpen, setRecentlyCompletedModalOpen] = useState(false);

  const canOfficeStaff = useCanAccessComponent(PAGE_ID, 'kpi-office-staff');
  const canReviewsDue = useCanAccessComponent(PAGE_ID, 'kpi-reviews-due');
  const canStaffList = useCanAccessComponent(PAGE_ID, 'staff-list');
  const canReviewTracker = useCanAccessComponent(PAGE_ID, 'review-tracker-chart');
  const canRecentlyCompleted = useCanAccessComponent(PAGE_ID, 'recently-completed-reviews');

  const reviewsKPIs = useMemo(
    () =>
      reviewsKPIItems
        .filter(
          (item) =>
            (item.id === 'kpi-office-staff' && canOfficeStaff) || (item.id === 'kpi-reviews-due' && canReviewsDue)
        )
        .map(({ id, ...rest }) => rest),
    [canOfficeStaff, canReviewsDue]
  );

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <TeamHrIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Reviews Management
          </h2>
        </div>

        {reviewsKPIs.length > 0 && <CommandCenterKPICards items={reviewsKPIs} />}

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

        {canRecentlyCompleted && (
          <div className="grid grid-cols-1 gap-6 items-stretch">
            <div className="min-h-0 flex flex-col">
              <RecentlyCompletedReviewsCard
                items={mockRecentlyCompletedReviews}
                onView={() => {}}
                onViewAll={() => setRecentlyCompletedModalOpen(true)}
              />
            </div>
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
        onView={() => {}}
      />
    </Layout>
  );
};

import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Login } from './pages/auth/Login';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { SetPassword } from './pages/auth/SetPassword';
import { SelfReviewByToken } from './pages/auth/SelfReviewByToken';
import { CommandCenter } from './pages/dashboard/CommandCenter';
import { SalesLaborDetails } from './pages/dashboard/SalesLaborDetails';
import { SalesTrendReports } from './pages/dashboard/SalesTrendReports';
import { InventoryFoodCost } from './pages/dashboard/InventoryFoodCost';
import { TrainingManagement } from './pages/dashboard/TrainingManagement';
import { ReviewsManagement } from './pages/dashboard/ReviewsManagement';
import { DisciplinaryManagement } from './pages/dashboard/DisciplinaryManagement';
import { DisciplinaryManagementDetails } from './pages/dashboard/DisciplinaryManagementDetails';
import { CalendarEvents } from './pages/dashboard/CalendarEvents';
import { UserManagement } from './pages/dashboard/UserManagement';
import { RBACManagement } from './pages/dashboard/RBACManagement';
import { ManageHierarchy } from './pages/dashboard/ManageHierarchy';
import { GoalSetting } from './pages/dashboard/GoalSetting';
import { LocationManagement } from './pages/dashboard/LocationManagement';
import { ReviewSettings } from './pages/dashboard/ReviewSettings';
import { DisciplinarySettings } from './pages/dashboard/DisciplinarySettings';
import { TrainingSettings } from './pages/dashboard/TrainingSettings';
import { EventsNotificationsSettings } from './pages/dashboard/EventsNotificationsSettings';
import { AlertsNotificationsSettings } from './pages/dashboard/AlertsNotificationsSettings';
import { DataSyncSettings } from './pages/dashboard/DataSyncSettings';
import { KitchenPerformance } from './pages/dashboard/KitchenPerformance';
import { KitchenPerformanceDetails } from './pages/dashboard/KitchenPerformanceDetails';
import { KitchenPerformanceReportProvider } from './context/KitchenPerformanceReportContext';
import { ActivityLog } from './pages/dashboard/ActivityLog';
import { RatingsAndReviews } from './pages/dashboard/RatingsAndReviews';
import { Profile } from './pages/dashboard/Profile';
import { NoAccess } from './pages/dashboard/NoAccess';
import { ErrorPage } from './pages/ErrorPage';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { RootRedirect } from './components/auth/RootRedirect';
import { useSelector } from 'react-redux';
import { RootState } from './store/store';
import { ReactNode } from 'react';
import { getPageIdFromPath, canAccessPage, hasAccessToAnyPage } from './config/permissions.config';

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const pageId = getPageIdFromPath(pathname);
  if (pageId != null && !canAccessPage(user?.permissions, pageId)) {
    return <Navigate to="/dashboard/no-access" replace />;
  }

  return <>{children}</>;
};

/** Redirects to command-center or no-access depending on whether the user has any page access. */
const DashboardRedirect = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const to = hasAccessToAnyPage(user?.permissions)
    ? '/dashboard/command-center'
    : '/dashboard/no-access';
  return <Navigate to={to} replace />;
};

const KitchenPerformanceLayout = () => (
  <KitchenPerformanceReportProvider>
    <Outlet />
  </KitchenPerformanceReportProvider>
);

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
    errorElement: <ErrorPage />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPassword />,
    errorElement: <ErrorPage />,
  },
  {
    path: '/set-password',
    element: <SetPassword />,
    errorElement: <ErrorPage />,
  },
  {
    path: '/self-review',
    element: <SelfReviewByToken />,
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/command-center',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <CommandCenter />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/sales-labor-detail',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <SalesLaborDetails />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/sales-trend-reports',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <SalesTrendReports />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/inventory-food-cost',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <InventoryFoodCost />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/training-management',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <TrainingManagement />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/reviews-management',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <ReviewsManagement />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/training-reviews',
    element: <Navigate to="/dashboard/reviews-management" replace />,
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/disciplinary-management',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <DisciplinaryManagement />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/disciplinary-management/:employeeId',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <DisciplinaryManagementDetails />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/team-hr',
    element: <Navigate to="/dashboard/reviews-management" replace />,
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/calendar-events',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <CalendarEvents />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/user-management',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <UserManagement />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/rbac-management',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <RBACManagement />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/rbac-management/hierarchy',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <ManageHierarchy />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/goal-setting',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <GoalSetting />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/location-management',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <LocationManagement />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/review-settings',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <ReviewSettings />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/disciplinary-settings',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <DisciplinarySettings />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/training-settings',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <TrainingSettings />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/events-notifications-settings',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <EventsNotificationsSettings />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/alerts-notifications-settings',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <AlertsNotificationsSettings />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/data-sync-settings',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <DataSyncSettings />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/kitchen-performance',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <KitchenPerformanceLayout />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <KitchenPerformance />,
      },
      {
        path: ':deviceName',
        element: <KitchenPerformanceDetails />,
      },
    ],
  },
  {
    path: '/dashboard/activity-log',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <ActivityLog />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/ratings-and-reviews',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <RatingsAndReviews />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/profile',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard/no-access',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <NoAccess />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <DashboardRedirect />
      </ProtectedRoute>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/',
    element: <RootRedirect />,
    errorElement: <ErrorPage />,
  },
]);

import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { Login } from './pages/auth/Login';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { CommandCenter } from './pages/dashboard/CommandCenter';
import { SalesLaborDetails } from './pages/dashboard/SalesLaborDetails';
import { SalesTrendReports } from './pages/dashboard/SalesTrendReports';
import { InventoryFoodCost } from './pages/dashboard/InventoryFoodCost';
import { TrainingReviews } from './pages/dashboard/TrainingReviews';
import { DisciplinaryManagement } from './pages/dashboard/DisciplinaryManagement';
import { DisciplinaryManagementDetails } from './pages/dashboard/DisciplinaryManagementDetails';
import { CalendarEvents } from './pages/dashboard/CalendarEvents';
import { UserManagement } from './pages/dashboard/UserManagement';
import { RBACManagement } from './pages/dashboard/RBACManagement';
import { GoalSetting } from './pages/dashboard/GoalSetting';
import { LocationManagement } from './pages/dashboard/LocationManagement';
import { ErrorPage } from './pages/ErrorPage';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { RootRedirect } from './components/auth/RootRedirect';
import { useSelector } from 'react-redux';
import { RootState } from './store/store';
import { ReactNode } from 'react';
import { getPageIdFromPath, canAccessPage } from './config/permissions.config';

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const pageId = getPageIdFromPath(pathname);
  if (pageId != null && !canAccessPage(user?.permissions, pageId)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

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
    path: '/dashboard/training-reviews',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <TrainingReviews />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
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
    element: <Navigate to="/dashboard/training-reviews" replace />,
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
    path: '/dashboard',
    element: <Navigate to="/dashboard/command-center" replace />,
    errorElement: <ErrorPage />,
  },
  {
    path: '/',
    element: <RootRedirect />,
    errorElement: <ErrorPage />,
  },
]);

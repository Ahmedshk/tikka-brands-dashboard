import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import { hasAccessToAnyPage } from '../../config/permissions.config';

/**
 * Redirects from "/" to dashboard if logged in (or to no-access if user has no page access), otherwise to login.
 * Only rendered after authCheckDone so we don't redirect before session is restored.
 */
export const RootRedirect = () => {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const to = hasAccessToAnyPage(user?.permissions)
    ? '/dashboard/command-center'
    : '/dashboard/no-access';
  return <Navigate to={to} replace />;
};

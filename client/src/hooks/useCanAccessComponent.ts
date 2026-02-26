import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { canAccessComponent } from '../config/permissions.config';

/**
 * Returns whether the current user's role allows access to the given component on the page.
 * Use to conditionally render and avoid fetching data for disallowed components.
 */
export function useCanAccessComponent(pageId: string, componentId: string): boolean {
  const permissions = useSelector((state: RootState) => state.auth.user?.permissions);
  return canAccessComponent(permissions, pageId, componentId);
}

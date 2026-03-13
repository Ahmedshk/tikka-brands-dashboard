import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { canAccessComponent, getEffectivePermissions } from '../config/permissions.config';

/**
 * Returns whether the current user has access to the given component on the page.
 * Uses effective permissions (permissions + overrides − removals) so visibility
 * respects user-specific removals (e.g. labor gauge and alerts hidden when only KPIs + chart granted).
 */
export function useCanAccessComponent(pageId: string, componentId: string): boolean {
  const user = useSelector((state: RootState) => state.auth.user);
  const effective = getEffectivePermissions(
    user?.permissions,
    user?.permissionOverrides ?? null,
    user?.permissionRemovals ?? null
  );
  return canAccessComponent(effective ?? user?.permissions, pageId, componentId);
}

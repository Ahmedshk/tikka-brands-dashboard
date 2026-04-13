import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { getEffectivePermissions } from '../config/permissions.config';
import { getAllowedGoalValueKeys } from '../utils/goalSettingPermissionHelpers';
import type { GoalValueKey } from '../utils/goalSettingHelpers';

/**
 * Goal metrics the current user may view or edit on Goal Setting, derived from
 * role permissions plus user permission overrides and removals.
 */
export function useGoalSettingAllowedGoalKeys(): ReadonlySet<GoalValueKey> {
  const user = useSelector((state: RootState) => state.auth.user);
  return useMemo(() => {
    const effective = getEffectivePermissions(
      user?.permissions,
      user?.permissionOverrides ?? null,
      user?.permissionRemovals ?? null
    );
    return getAllowedGoalValueKeys(effective ?? user?.permissions);
  }, [user?.permissions, user?.permissionOverrides, user?.permissionRemovals]);
}

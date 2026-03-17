import { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { roleService } from '../services/role.service';
import { getDescendantIds } from '../utils/hierarchyTreeHelpers';
import type { RoleRow } from '../types/rbac.types';
import type { RootState } from '../store/store';

export interface TrainingHierarchyAllowed {
  /** Role IDs the current user can assign training to (descendants only; same-level excluded). */
  allowedRoleIds: Set<string>;
  /** Role names for filtering assignment list by row.role (descendants only). */
  allowedRoleNames: Set<string>;
  loading: boolean;
}

/**
 * Returns the set of role IDs and names the current user is allowed to see/assign training to
 * based on the role hierarchy: only descendant roles. Same-level users cannot see or assign.
 */
export function useTrainingHierarchyAllowed(): TrainingHierarchyAllowed {
  const user = useSelector((state: RootState) => state.auth.user);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    roleService
      .list(true)
      .then((list) => {
        if (!cancelled) setRoles(list);
      })
      .catch(() => {
        if (!cancelled) setRoles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo((): TrainingHierarchyAllowed => {
    if (loading || !user?.role || roles.length === 0) {
      return {
        allowedRoleIds: new Set(),
        allowedRoleNames: new Set(),
        loading,
      };
    }

    const currentRoleName = typeof user.role === 'string' ? user.role : (user.role as { toString?: () => string })?.toString?.() ?? '';
    const currentRole = roles.find((r) => r.roleName === currentRoleName);
    const currentRoleId = currentRole?.id;

    if (!currentRoleId) {
      return {
        allowedRoleIds: new Set(),
        allowedRoleNames: new Set(),
        loading: false,
      };
    }

    const hierarchyMap = new Map<string, string | null>();
    for (const r of roles) {
      if (r.id != null) {
        hierarchyMap.set(r.id, r.reportsTo ?? null);
      }
    }

    const descendantIds = getDescendantIds(currentRoleId, hierarchyMap);
    const allowedRoleIds = new Set<string>(descendantIds);

    const roleById = new Map(roles.map((r) => [r.id!, r]));
    const allowedRoleNames = new Set(
      [...allowedRoleIds].map((id) => roleById.get(id)?.roleName).filter(Boolean) as string[]
    );

    return {
      allowedRoleIds,
      allowedRoleNames,
      loading: false,
    };
  }, [user?.role, roles, loading]);
}

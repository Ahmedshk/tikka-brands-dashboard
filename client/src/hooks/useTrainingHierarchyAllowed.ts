import { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { trainingService, type TrainingRoleHierarchyRow } from '../services/training.service';
import { getDescendantIds } from '../utils/hierarchyTreeHelpers';
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
  const [roles, setRoles] = useState<TrainingRoleHierarchyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    trainingService
      .listRoleHierarchySnapshot(true, { signal: ac.signal })
      .then((list) => {
        if (ac.signal.aborted) return;
        setRoles(list);
      })
      .catch((e: unknown) => {
        if (axios.isCancel(e) || (e as { code?: string })?.code === 'ERR_CANCELED') return;
        if (!ac.signal.aborted) setRoles([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [user?._id]);

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

    const roleById = new Map(roles.map((r) => [r.id, r]));
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

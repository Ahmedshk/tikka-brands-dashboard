import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { navigationConfig } from '../utils/navigation.config';
import type { NavigationConfig, NavigationItem, NavigationChild } from '../types/navigation.types';
import { getPageIdFromPath, canAccessPage } from '../config/permissions.config';

/**
 * Returns navigation config filtered by the current user's permissions.
 * If user has no permissions (legacy), all items are shown.
 */
export function useFilteredNavigation(): NavigationConfig {
  const permissions = useSelector((state: RootState) => state.auth.user?.permissions);

  return useMemo(() => {
    return navigationConfig
      .map((item): NavigationItem | null => {
        if (item.children) {
          const filteredChildren: NavigationChild[] = item.children.filter((child) => {
            const pageId = getPageIdFromPath(child.path);
            return pageId != null && canAccessPage(permissions, pageId);
          });
          if (filteredChildren.length === 0) return null;
          return { ...item, children: filteredChildren };
        }
        if (item.path) {
          const pageId = getPageIdFromPath(item.path);
          if (pageId == null || !canAccessPage(permissions, pageId)) return null;
        }
        return item;
      })
      .filter((item): item is NavigationItem => item != null);
  }, [permissions]);
}

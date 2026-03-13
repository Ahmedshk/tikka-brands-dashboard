import type { Dispatch, SetStateAction } from 'react';
import type { RolePermissions, PagePermission } from '../types/rbac.types';
import { getPageEntry, computeNextPermissionsAfterPageComponentChange } from './addEditRoleModalHelpers';

export function setOverridesPageSelectAll(
  current: RolePermissions | null,
  setter: (v: RolePermissions | null) => void,
  pageId: string,
  pageLabel: string,
  selected: boolean
): void {
  const pages = current?.type === 'custom' ? current.pages : [];
  const rest = pages.filter((p) => p.pageId !== pageId);
  if (selected) {
    rest.push({ pageId, pageLabel, components: [] });
  }
  setter(rest.length === 0 ? null : { type: 'custom', pages: rest });
}

export function setOverridesPageComponent(
  current: RolePermissions | null,
  setter: (v: RolePermissions | null) => void,
  pageId: string,
  pageLabel: string,
  componentId: string,
  selected: boolean
): void {
  const forUI: RolePermissions =
    current?.type === 'custom' && current.pages.length > 0 ? current : { type: 'custom', pages: [] };
  const next = computeNextPermissionsAfterPageComponentChange(forUI, pageId, pageLabel, componentId, selected);
  setter(next.type === 'custom' && next.pages.length === 0 ? null : next);
}

export function addPageToRemovals(
  current: RolePermissions | null,
  setter: (v: RolePermissions | null) => void,
  pageId: string,
  pageLabel: string
): void {
  const pages = current?.type === 'custom' ? current.pages : [];
  const rest = pages.filter((p) => p.pageId !== pageId);
  rest.push({ pageId, pageLabel, components: [] });
  setter({ type: 'custom', pages: rest });
}

export function isPageFullyRemoved(pages: PagePermission[], pageId: string): boolean {
  const entry = getPageEntry(pages, pageId);
  return entry != null && (entry.components == null || entry.components.length === 0);
}

export function getPermissionBarRole(
  fromRole: boolean,
  overrideOrChecked: boolean
): 'green' | 'blue' | 'none' {
  if (fromRole) return 'green';
  if (overrideOrChecked) return 'blue';
  return 'none';
}

export function getPermissionBarStyle(
  role: 'green' | 'blue' | 'none'
): { borderLeftColor: string } | undefined {
  if (role === 'green') return { borderLeftColor: '#5dc54f' };
  if (role === 'blue') return { borderLeftColor: '#FDB90E' };
  return undefined;
}

export function removePageFromRemovals(
  current: RolePermissions | null,
  setter: (v: RolePermissions | null) => void,
  pageId: string
): void {
  const pages = current?.type === 'custom' ? current.pages : [];
  const rest = pages.filter((p) => p.pageId !== pageId);
  setter(rest.length === 0 ? null : { type: 'custom', pages: rest });
}

export function setRemovalsPageComponent(
  setter: Dispatch<SetStateAction<RolePermissions | null>>,
  pageId: string,
  pageLabel: string,
  componentId: string,
  selected: boolean
): void {
  setter((prev) => {
    const forUI: RolePermissions =
      prev?.type === 'custom' && prev.pages && prev.pages.length > 0 ? prev : { type: 'custom', pages: [] };
    const next = computeNextPermissionsAfterPageComponentChange(forUI, pageId, pageLabel, componentId, selected);
    const pages =
      next.type === 'custom' ? next.pages.filter((p) => p.components != null && p.components.length > 0) : [];
    return pages.length === 0 ? null : { type: 'custom', pages };
  });
}

import type { TreeNodeData } from '../components/RBAC/TreeNode';

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 1.5;
export const ZOOM_STEP = 0.1;

export interface HierarchyRoleItem {
  id: string;
  name: string;
  isSystem: boolean;
}

export function getRemoveConfirmMessage(
  confirmRemove: { roleName: string; descendantCount: number } | null
): string {
  if (!confirmRemove) return '';
  if (confirmRemove.descendantCount > 0) {
    const plural = confirmRemove.descendantCount === 1 ? '' : 's';
    return `Remove "${confirmRemove.roleName}" and its ${confirmRemove.descendantCount} child role${plural} from the hierarchy? They will become unassigned and can be re-added later.`;
  }
  return `Remove "${confirmRemove.roleName}" from the hierarchy? It will become unassigned and can be re-added later.`;
}

export function buildTree(
  roles: HierarchyRoleItem[],
  hierarchyMap: Map<string, string | null>
): TreeNodeData | null {
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const ownerRole = roles.find((r) => r.isSystem);
  if (!ownerRole) return null;

  const childrenMap = new Map<string, string[]>();
  for (const [roleId, parentId] of hierarchyMap) {
    if (parentId != null) {
      const siblings = childrenMap.get(parentId) ?? [];
      siblings.push(roleId);
      childrenMap.set(parentId, siblings);
    }
  }

  function buildNode(roleId: string): TreeNodeData | null {
    const role = roleById.get(roleId);
    if (!role) return null;
    const childIds = childrenMap.get(roleId) ?? [];
    const children = childIds
      .map(buildNode)
      .filter((n): n is TreeNodeData => n != null);
    return {
      roleId: role.id,
      roleName: role.name,
      isSystem: role.isSystem,
      children,
    };
  }

  return buildNode(ownerRole.id);
}

export function getDescendantIds(
  roleId: string,
  hierarchyMap: Map<string, string | null>
): Set<string> {
  const childrenMap = new Map<string, string[]>();
  for (const [id, parentId] of hierarchyMap) {
    if (parentId != null) {
      const siblings = childrenMap.get(parentId) ?? [];
      siblings.push(id);
      childrenMap.set(parentId, siblings);
    }
  }
  const result = new Set<string>();
  const queue = childrenMap.get(roleId) ?? [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.add(id);
    const children = childrenMap.get(id);
    if (children) queue.push(...children);
  }
  return result;
}

export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 10) / 10));
}

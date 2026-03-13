/**
 * Pure helper functions for role hierarchy operations.
 * All functions operate on in-memory arrays -- no DB calls.
 */

import { SYSTEM_ROLE_NAME } from "../types/rbac.types.js";

export interface HierarchyRole {
  _id: string;
  name: string;
  reportsTo: string | null;
  isSystem?: boolean;
}

export interface HierarchyMapping {
  roleId: string;
  reportsTo: string | null;
}

/**
 * Returns true if setting `roleId.reportsTo = proposedParentId` would create a cycle.
 * Walks up from the proposed parent; if we encounter `roleId`, it's a cycle.
 */
export function wouldCreateCycle(
  roleId: string,
  proposedParentId: string,
  roles: HierarchyRole[]
): boolean {
  if (roleId === proposedParentId) return true;
  const byId = new Map(roles.map((r) => [r._id, r]));
  let current: string | null = proposedParentId;
  const visited = new Set<string>();
  while (current != null) {
    if (current === roleId) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    const role = byId.get(current);
    current = role?.reportsTo ?? null;
  }
  return false;
}

function buildSnapshot(
  mappings: HierarchyMapping[],
  allRoles: HierarchyRole[],
  roleById: Map<string, HierarchyRole>
): Map<string, string | null> | string {
  const snapshot = new Map<string, string | null>();
  for (const r of allRoles) {
    snapshot.set(r._id, r.reportsTo);
  }
  for (const m of mappings) {
    if (!roleById.has(m.roleId)) return `Role ${m.roleId} does not exist.`;
    if (m.reportsTo != null && !roleById.has(m.reportsTo)) {
      return `Parent role ${m.reportsTo} does not exist.`;
    }
    snapshot.set(m.roleId, m.reportsTo);
  }
  return snapshot;
}

function validateSnapshotEntries(
  snapshot: Map<string, string | null>,
  roleById: Map<string, HierarchyRole>
): string | null {
  for (const [roleId, parentId] of snapshot) {
    if (roleId === parentId) {
      return `Role "${roleById.get(roleId)?.name}" cannot report to itself.`;
    }
    const role = roleById.get(roleId);
    if (role?.isSystem && role.name === SYSTEM_ROLE_NAME && parentId != null) {
      return `The ${SYSTEM_ROLE_NAME} role cannot report to another role.`;
    }
  }
  return null;
}

function detectCycles(
  snapshot: Map<string, string | null>,
  roleById: Map<string, HierarchyRole>
): string | null {
  for (const [roleId] of snapshot) {
    const visited = new Set<string>();
    let current: string | null = roleId;
    while (current != null) {
      if (visited.has(current)) {
        return `Circular hierarchy detected involving role "${roleById.get(current)?.name}".`;
      }
      visited.add(current);
      current = snapshot.get(current) ?? null;
    }
  }
  return null;
}

/**
 * Validate a full set of hierarchy mappings before bulk-saving.
 * Returns an error string if invalid, or null if valid.
 */
export function validateHierarchyMappings(
  mappings: HierarchyMapping[],
  allRoles: HierarchyRole[]
): string | null {
  const roleById = new Map(allRoles.map((r) => [r._id, r]));
  const snapshotOrError = buildSnapshot(mappings, allRoles, roleById);
  if (typeof snapshotOrError === "string") return snapshotOrError;

  const entryError = validateSnapshotEntries(snapshotOrError, roleById);
  if (entryError) return entryError;

  return detectCycles(snapshotOrError, roleById);
}

/** BFS to get all role IDs beneath a given role. */
export function getDescendantRoleIds(
  roleId: string,
  roles: HierarchyRole[]
): string[] {
  const childrenMap = new Map<string, string[]>();
  for (const r of roles) {
    if (r.reportsTo != null) {
      const siblings = childrenMap.get(r.reportsTo) ?? [];
      siblings.push(r._id);
      childrenMap.set(r.reportsTo, siblings);
    }
  }
  const result: string[] = [];
  const queue = childrenMap.get(roleId) ?? [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    const children = childrenMap.get(id);
    if (children) queue.push(...children);
  }
  return result;
}

/** Walk up from a role to the root; returns ordered array of ancestor role IDs (immediate parent first). */
export function getAncestorRoleIds(
  roleId: string,
  roles: HierarchyRole[]
): string[] {
  const byId = new Map(roles.map((r) => [r._id, r]));
  const result: string[] = [];
  let current = byId.get(roleId)?.reportsTo ?? null;
  const visited = new Set<string>();
  while (current != null && !visited.has(current)) {
    result.push(current);
    visited.add(current);
    current = byId.get(current)?.reportsTo ?? null;
  }
  return result;
}

/** True if `actorRoleId` is an ancestor of `targetRoleId`. */
export function isAncestorOf(
  actorRoleId: string,
  targetRoleId: string,
  roles: HierarchyRole[]
): boolean {
  const ancestors = getAncestorRoleIds(targetRoleId, roles);
  return ancestors.includes(actorRoleId);
}

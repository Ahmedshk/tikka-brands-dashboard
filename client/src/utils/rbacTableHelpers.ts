import type { RoleLocationsResponse } from '../types/rbac.types';

/** Comma-separated location labels for RBAC table (wraps in UI; no per-location line breaks). */
export function formatRoleLocationsForTable(
  locations: RoleLocationsResponse | undefined
): string {
  if (locations == null || locations === 'all') return 'All';
  if (!Array.isArray(locations)) return 'All';
  const n = locations.length;
  if (n === 0) return 'None';
  const withNames = locations.every(
    (item): item is { _id: string; storeName: string } =>
      typeof item === 'object' && item != null && 'storeName' in item
  );
  if (withNames) {
    const names = locations.map((loc) => loc.storeName || '—').filter(Boolean);
    if (names.length > 0) return names.join(', ');
    return n === 1 ? '1 location' : `${n} locations`;
  }
  return n === 1 ? '1 location' : `${n} locations`;
}

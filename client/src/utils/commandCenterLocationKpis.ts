import type { CommandCenterLocationBreakdown } from '../services/commandCenter.service';

/** Only render selected locations, once each and in the selection order. */
export function locationKpisForSelection(
  breakdown: readonly CommandCenterLocationBreakdown[], selectedIds: readonly string[],
): CommandCenterLocationBreakdown[] {
  const byId = new Map(breakdown.map(row => [row.locationId, row]));
  return [...new Set(selectedIds)].flatMap(id => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

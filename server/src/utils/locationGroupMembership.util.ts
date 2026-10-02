/** Read both multi-group membership and the legacy single-group field. */
export function locationGroupIds(doc: { groupIds?: readonly unknown[]; groupId?: unknown }): string[] {
  const ids = [...(doc.groupIds ?? []), doc.groupId]
    .filter((id) => id != null)
    .map(String)
    .filter(Boolean);
  return [...new Set(ids)];
}

/** Mongo expression used to convert legacy membership atomically on each write. */
export const locationGroupIdsExpression = {
  $setUnion: [
    { $ifNull: ['$groupIds', []] },
    { $cond: [{ $ne: [{ $ifNull: ['$groupId', null] }, null] }, ['$groupId'], []] },
  ],
};

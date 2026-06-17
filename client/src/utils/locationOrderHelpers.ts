/** Stable string key for comparing location id order. */
export function locationOrderKey(ids: readonly string[]): string {
  return ids.join('\u0001');
}

export function isSameLocationOrder(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

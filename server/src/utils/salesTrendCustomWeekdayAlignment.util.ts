/** Pair weekday occurrences within the chosen ranges without reading outside them. */
export function alignCustomComparisonBucketKeys(currentKeys: readonly string[], comparisonKeys: readonly string[]): string[] {
  const weekday = (key: string) => {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
  };
  const comparisonByWeekday = new Map<number, string[]>();
  for (const key of comparisonKeys) {
    const day = weekday(key);
    const keys = comparisonByWeekday.get(day) ?? [];
    keys.push(key);
    comparisonByWeekday.set(day, keys);
  }
  const occurrences = new Map<number, number>();
  return currentKeys.map(key => {
    const day = weekday(key);
    const occurrence = occurrences.get(day) ?? 0;
    occurrences.set(day, occurrence + 1);
    return comparisonByWeekday.get(day)?.[occurrence] ?? '';
  });
}

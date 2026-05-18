/**
 * Short-lived in-flight Promise dedup keyed by a stable string.
 *
 * When the dashboard fires multiple all-locations endpoints in parallel
 * (sales-trend, sales-trend-kpi, sales-by-category), each builder's prefetch
 * step would otherwise issue its own bulk Mongo queries even though the
 * queries are identical. This wraps the bulk-prefetch functions so concurrent
 * callers with the same args share a single Promise — N calls → 1 round-trip.
 *
 * Entries are deleted as soon as the underlying promise settles (success or
 * error), so this is purely an in-flight dedup, not a result cache. Result
 * caching lives in the downstream caches the prefetches populate.
 */

const inflight = new Map<string, Promise<unknown>>();

export function dedupInflight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = run().finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

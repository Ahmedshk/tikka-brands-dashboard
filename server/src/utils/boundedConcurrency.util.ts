/**
 * Run an async worker over a list of items with a bounded number of in-flight
 * promises at any time. Output order matches input order.
 *
 * Used to parallelize per-location fan-out in all-locations dashboard handlers
 * without overwhelming Mongo's connection pool.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const safeConcurrency = Math.max(1, Math.floor(concurrency));
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runOne(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i] as T;
      results[i] = await worker(item, i);
    }
  }

  const runners: Promise<void>[] = [];
  const lanes = Math.min(safeConcurrency, items.length);
  for (let i = 0; i < lanes; i++) {
    runners.push(runOne());
  }
  await Promise.all(runners);
  return results;
}

/**
 * Default concurrency for per-location dashboard fan-out. Tuned to balance
 * parallelism against Mongo connection pool pressure.
 */
export const DEFAULT_LOCATION_FANOUT_CONCURRENCY = 6;

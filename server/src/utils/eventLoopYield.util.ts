/**
 * Returns control to the Node event loop, allowing pending I/O callbacks
 * (HTTP requests, health probes, mongoose pool operations) to run before
 * the caller's next synchronous chunk of CPU work.
 *
 * Use inside CPU-bound loops such as JSON.parse of large pages or
 * bulkWrite batch boundaries to keep the HTTP path responsive during
 * long-running integration syncs.
 */
export const yieldEventLoop = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

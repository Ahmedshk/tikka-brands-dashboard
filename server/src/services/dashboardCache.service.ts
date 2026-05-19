/**
 * Read/write surface for `DashboardCacheModel`.
 *
 * Used by:
 *  - Dashboard endpoint handlers: `getCachedResponse` to short-circuit, then
 *    `putCachedResponse` on a live-compute miss.
 *  - The `dashboard-cache:refresh-15m` Agenda job: `listAllCacheEntries` to
 *    walk every key that needs refreshing, then `putCachedResponse` to
 *    replace it.
 */
import type { Request, Response } from "express";
import { logger } from "../utils/logger.util.js";
import { DashboardCacheModel } from "../models/dashboardCache.model.js";
import {
  buildCacheKeyFromParams,
  type DashboardEndpoint,
} from "../utils/dashboardCacheKey.util.js";
import { resolveLocationScopeForRequest } from "../utils/dashboardCacheScope.util.js";

/**
 * Maximum age before a cached entry is treated as a miss. Slightly larger than
 * the 15-minute cron interval so an in-progress refresh doesn't briefly turn
 * every entry stale. Combined with the Mongo TTL index (1800s), this also
 * means: if the cron stops, entries serve stale for at most a few minutes
 * past the cron interval before being treated as miss and recomputed live.
 */
const CACHE_FRESHNESS_MS = 18 * 60 * 1000;

export interface CachedResponse<T = unknown> {
  data: T;
  computedAt: Date;
}

export interface CacheEntrySpec {
  endpoint: DashboardEndpoint;
  locationScope: string;
  params: Record<string, unknown>;
}

export interface StoredCacheEntry {
  cacheKey: string;
  endpoint: DashboardEndpoint;
  locationScope: string;
  params: Record<string, unknown>;
  data: unknown;
  computedAt: Date;
}

/**
 * Look up a cached response for the given (endpoint, scope, params). Returns
 * `null` on miss or on cache error — callers fall through to live compute.
 */
export async function getCachedResponse<T>(
  spec: CacheEntrySpec,
): Promise<CachedResponse<T> | null> {
  try {
    const { cacheKey } = buildCacheKeyFromParams(spec);
    const doc = await DashboardCacheModel.findOne({ cacheKey })
      .select({ data: 1, computedAt: 1 })
      .lean()
      .exec();
    if (!doc) return null;
    if (Date.now() - doc.computedAt.getTime() > CACHE_FRESHNESS_MS) {
      // Past freshness window — treat as miss so caller recomputes and the
      // cache is rewritten with a fresh `computedAt`.
      return null;
    }
    return {
      data: doc.data as T,
      computedAt: doc.computedAt,
    };
  } catch (err) {
    logger.warn("[dashboard-cache] read failed", { err });
    return null;
  }
}

/**
 * Upsert a cached response. Errors are logged but not thrown — a cache write
 * failure should never break the user-facing request path.
 */
export async function putCachedResponse(
  spec: CacheEntrySpec,
  data: unknown,
): Promise<void> {
  try {
    const { cacheKey, paramsHash, normalizedParams } = buildCacheKeyFromParams(spec);
    await DashboardCacheModel.updateOne(
      { cacheKey },
      {
        $set: {
          cacheKey,
          endpoint: spec.endpoint,
          locationScope: spec.locationScope,
          paramsHash,
          params: normalizedParams,
          data,
          computedAt: new Date(),
        },
      },
      { upsert: true },
    ).exec();
  } catch (err) {
    logger.warn("[dashboard-cache] write failed", { err });
  }
}

/**
 * Enumerate every cache entry currently in the collection. Used by the cron
 * job to refresh whatever exists (the prior cycle wrote, plus any live-on-miss
 * writes the dashboard handlers made in between).
 */
/**
 * Cache-aside wrapper for a dashboard endpoint handler. Resolves the
 * `locationScope` from `req`, checks `DashboardCache`, and either serves the
 * cached response or runs `compute()` then upserts the result before
 * responding. Throws from `compute()` propagate to the caller's `try/catch`
 * (used by existing handlers for `NotFoundError` / `LaborDateRangeError`).
 */
export async function serveDashboardWithCache<T>(opts: {
  req: Request;
  res: Response;
  endpoint: DashboardEndpoint;
  params: Record<string, unknown>;
  compute: () => Promise<T>;
}): Promise<void> {
  const { req, res, endpoint, params, compute } = opts;
  const locationScope = await resolveLocationScopeForRequest(req);
  const spec = { endpoint, locationScope, params };
  const cached = await getCachedResponse<T>(spec);
  if (cached) {
    logger.info("[dashboard-cache] hit", { endpoint, locationScope });
    res.status(200).json({ success: true, data: cached.data });
    return;
  }
  logger.info("[dashboard-cache] miss → live + populate", { endpoint, locationScope });
  const data = await compute();
  await putCachedResponse(spec, data);
  res.status(200).json({ success: true, data });
}

export async function listAllCacheEntries(): Promise<StoredCacheEntry[]> {
  const docs = await DashboardCacheModel.find({})
    .select({ cacheKey: 1, endpoint: 1, locationScope: 1, params: 1, data: 1, computedAt: 1 })
    .lean()
    .exec();
  return docs.map((d) => ({
    cacheKey: d.cacheKey,
    endpoint: d.endpoint as DashboardEndpoint,
    locationScope: d.locationScope,
    params: (d.params ?? {}) as Record<string, unknown>,
    data: d.data,
    computedAt: d.computedAt,
  }));
}

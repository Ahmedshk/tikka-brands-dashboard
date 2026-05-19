import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * Pre-computed dashboard response cache. One document per
 * (endpoint, locationScope, paramsHash) tuple. Written by:
 *  - The cache-aside live-on-miss path in each dashboard endpoint handler.
 *  - The `dashboard-cache:refresh-15m` Agenda job, which iterates every
 *    existing entry plus a hardcoded set of "common" entries and rewrites
 *    each with the current response.
 *
 * The cache is a passive read-only layer for user requests; webhooks do NOT
 * touch this collection. Worst-case staleness is bounded by the cron
 * interval (15 min).
 */
export interface DashboardCacheDocument extends Document {
  _id: Types.ObjectId;
  /**
   * Deterministic primary key = `${endpoint}|${locationScope}|${paramsHash}`.
   * Used both as the unique index and the find-by-key value.
   */
  cacheKey: string;
  /** The dashboard endpoint name, e.g. "sales-labor.sales-trend". */
  endpoint: string;
  /**
   * `__all__|<hash-of-sorted-allowed-ids>` for all-locations requests, or a
   * single location id for single-location views. The hash component
   * distinguishes users with different effective allow-lists so a tenant
   * admin and a limited-access user can't collide.
   */
  locationScope: string;
  /** Hash of the normalized request params (period, comparison, metric, etc.). */
  paramsHash: string;
  /** The raw params used to build this entry, kept so the cron can rebuild it. */
  params: Record<string, unknown>;
  /** Serialized HTTP response body the handler will return. */
  data: unknown;
  /** When the entry was last computed. */
  computedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<DashboardCacheDocument>(
  {
    cacheKey: { type: String, required: true, trim: true },
    endpoint: { type: String, required: true, trim: true },
    locationScope: { type: String, required: true, trim: true },
    paramsHash: { type: String, required: true, trim: true },
    params: { type: Schema.Types.Mixed, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    computedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

schema.index({ cacheKey: 1 }, { unique: true });
// TTL safety: an entry the cron stops refreshing for 30 minutes expires
// automatically (covers the gap where cron failed or the (location, params)
// combo is no longer relevant). The cron rewrites `computedAt` on every
// cycle so active entries never age out.
schema.index({ computedAt: 1 }, { expireAfterSeconds: 1800 });
// Used to enumerate entries per endpoint when debugging or selectively warming.
schema.index({ endpoint: 1, locationScope: 1 });

export const DashboardCacheModel = mongoose.model<DashboardCacheDocument>(
  "DashboardCache",
  schema,
);

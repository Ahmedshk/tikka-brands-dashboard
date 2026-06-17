import mongoose from "mongoose";
import { LocationModel } from "../models/location.model.js";
import { MarketManOrderCacheModel } from "../models/marketmanOrderCache.model.js";

export interface LocationRollupContext {
  _id: mongoose.Types.ObjectId;
  timezone: string;
  businessStartTime: string;
  marketManBuyerGuid?: string;
}

function toRollupContext(doc: {
  _id: unknown;
  timezone?: string;
  businessStartTime?: string;
  marketManBuyerGuid?: string;
}): LocationRollupContext {
  const base: LocationRollupContext = {
    _id: doc._id as mongoose.Types.ObjectId,
    timezone: String(doc.timezone ?? "UTC"),
    businessStartTime: String(doc.businessStartTime ?? "00:00"),
  };
  const g =
    typeof doc.marketManBuyerGuid === "string"
      ? doc.marketManBuyerGuid.trim()
      : "";
  if (g.length > 0) return { ...base, marketManBuyerGuid: g };
  return base;
}

/**
 * Load location contexts for a rollup script run.
 *
 * Accepts either:
 *   - a single id string (legacy; preserved for any other callers that pass
 *     `args.locationId` directly)
 *   - an array of ids (new; lets the CLI restrict the script to a chosen
 *     subset without running it N separate times)
 *   - `undefined` / empty (all locations)
 *
 * Order of returned locations: when explicit ids are given, results follow
 * the caller's id order so logs match the CLI input. When no filter is
 * passed, the existing newest-first ordering is preserved.
 */
export async function loadLocationsForRollupScript(
  filter?: string | string[],
): Promise<LocationRollupContext[]> {
  const ids: string[] = Array.isArray(filter)
    ? filter.map((s) => s.trim()).filter((s) => s.length > 0)
    : filter?.trim()
      ? [filter.trim()]
      : [];

  if (ids.length === 0) {
    const docs = await LocationModel.find({})
      .select({ timezone: 1, businessStartTime: 1, marketManBuyerGuid: 1 })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean()
      .exec();
    return docs.map((doc) => toRollupContext(doc));
  }

  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  const docs = await LocationModel.find({ _id: { $in: objectIds } })
    .select({ timezone: 1, businessStartTime: 1, marketManBuyerGuid: 1 })
    .lean()
    .exec();
  // Preserve the caller's id order so the script logs read top-to-bottom in
  // the same sequence the operator typed on the CLI.
  const byId = new Map<string, LocationRollupContext>();
  for (const doc of docs) byId.set(String(doc._id), toRollupContext(doc));
  const out: LocationRollupContext[] = [];
  for (const id of ids) {
    const ctx = byId.get(id);
    if (ctx) out.push(ctx);
  }
  return out;
}

export async function distinctBuyerGuidsForMarketManRollup(
  locationMongoId: string,
  locationBuyerGuid?: string,
): Promise<string[]> {
  const set = new Set<string>();
  if (locationBuyerGuid?.trim()) set.add(locationBuyerGuid.trim());
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const fromCache = await MarketManOrderCacheModel.distinct("buyerGuid", {
    locationId: oid,
  });
  for (const g of fromCache) {
    if (typeof g === "string" && g.trim()) set.add(g.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

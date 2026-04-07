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

export async function loadLocationsForRollupScript(
  filterLocationId?: string,
): Promise<LocationRollupContext[]> {
  if (filterLocationId?.trim()) {
    const doc = await LocationModel.findById(filterLocationId.trim())
      .select({ timezone: 1, businessStartTime: 1, marketManBuyerGuid: 1 })
      .lean()
      .exec();
    if (!doc) return [];
    return [toRollupContext(doc)];
  }
  const docs = await LocationModel.find({})
    .select({ timezone: 1, businessStartTime: 1, marketManBuyerGuid: 1 })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
  return docs.map((doc) => toRollupContext(doc));
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

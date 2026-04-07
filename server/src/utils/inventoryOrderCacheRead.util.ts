import mongoose from "mongoose";
import { MarketManOrderCacheModel } from "../models/marketmanOrderCache.model.js";
import type {
  MarketManOrder,
  OrderTrackerRange,
} from "../services/marketman.service.js";
import { parseMarketManUtcToDate } from "./marketmanUtcDateParse.util.js";

function orderTrackerRangeToBusinessDateBounds(
  range: OrderTrackerRange,
): { from: Date; to: Date } | null {
  const fromMs = parseMarketManUtcToDate(range.dateTimeFromUTC)?.getTime();
  const toMs = parseMarketManUtcToDate(range.dateTimeToUTC)?.getTime();
  if (fromMs == null || toMs == null) return null;
  return { from: new Date(fromMs), to: new Date(toMs) };
}

/**
 * Load MarketMan orders from Mongo cache for the given UTC window using indexed `businessDateAt`.
 */
export async function loadMarketManOrdersFromOrderCacheByKindInRange(
  locationMongoId: string,
  buyerGuid: string,
  apiKind: "sent" | "delivery",
  range: OrderTrackerRange,
): Promise<MarketManOrder[]> {
  const bounds = orderTrackerRangeToBusinessDateBounds(range);
  if (!bounds) return [];
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const docs = await MarketManOrderCacheModel.find({
    locationId: oid,
    buyerGuid,
    apiKind,
    businessDateAt: { $gte: bounds.from, $lte: bounds.to },
  })
    .select({ raw: 1 })
    .lean()
    .exec();
  return docs.map((d) => d.raw as MarketManOrder);
}

/** In-memory filter when full cache rows are already loaded (e.g. tests or legacy paths). */
export function filterMarketManOrdersByUtcRange(
  orders: MarketManOrder[],
  range: OrderTrackerRange,
  dateField: "DeliveryDateUTC" | "SentDateUTC",
): MarketManOrder[] {
  const fromMs = parseMarketManUtcToDate(range.dateTimeFromUTC)?.getTime();
  const toMs = parseMarketManUtcToDate(range.dateTimeToUTC)?.getTime();
  if (fromMs == null || toMs == null) return [];
  return orders.filter((o) => {
    const raw = o as Record<string, string | undefined>;
    const t = parseMarketManUtcToDate(raw[dateField])?.getTime();
    return t != null && t >= fromMs && t <= toMs;
  });
}

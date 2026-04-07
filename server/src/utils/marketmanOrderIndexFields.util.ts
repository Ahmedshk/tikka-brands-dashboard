import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import { parseMarketManUtcToDate } from "./marketmanUtcDateParse.util.js";

export function getMarketManOrderBusinessDateAt(
  raw: Record<string, unknown>,
  apiKind: MarketManOrderApiKind,
): Date | null {
  const key = apiKind === "delivery" ? "DeliveryDateUTC" : "SentDateUTC";
  const v = raw[key];
  if (typeof v !== "string") return null;
  return parseMarketManUtcToDate(v);
}

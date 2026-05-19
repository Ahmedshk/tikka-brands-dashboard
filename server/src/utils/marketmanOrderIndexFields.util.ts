import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import { pickMarketManOrderDateString } from "./marketmanWebhookOrderDates.util.js";
import { parseMarketManUtcToDate } from "./marketmanUtcDateParse.util.js";

export function getMarketManOrderBusinessDateAt(
  raw: Record<string, unknown>,
  apiKind: MarketManOrderApiKind,
): Date | null {
  const v = pickMarketManOrderDateString(raw, apiKind);
  if (!v) return null;
  return parseMarketManUtcToDate(v);
}

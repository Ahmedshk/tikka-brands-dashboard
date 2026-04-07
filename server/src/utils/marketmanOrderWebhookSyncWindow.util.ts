import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import { formatMarketManDateUtc } from "../services/marketman.client.js";
import { parseMarketManUtcToDate } from "./marketmanUtcDateParse.util.js";

/**
 * Derive `dateTimeFromUTC` / `dateTimeToUTC` for {@link upsertMarketManOrder} from webhook order JSON
 * (same MM shape as API responses: `DeliveryDateUTC` / `SentDateUTC`).
 */
export function marketManOrderWebhookSyncWindowUtc(
  order: Record<string, unknown>,
  apiKind: MarketManOrderApiKind,
): { dateTimeFromUTC: string; dateTimeToUTC: string } | null {
  const key = apiKind === "delivery" ? "DeliveryDateUTC" : "SentDateUTC";
  const raw = order[key];
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = parseMarketManUtcToDate(raw);
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const start = new Date(Date.UTC(y, m, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, day, 23, 59, 59, 999));
  return {
    dateTimeFromUTC: formatMarketManDateUtc(start),
    dateTimeToUTC: formatMarketManDateUtc(end),
  };
}

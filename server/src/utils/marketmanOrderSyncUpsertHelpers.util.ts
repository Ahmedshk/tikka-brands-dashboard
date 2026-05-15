import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import { bulkUpsertMarketManOrders } from "../services/integrationCacheWrite.service.js";

export async function fetchAndUpsertMarketManOrdersForWindow(
  locationId: string,
  buyerGuid: string,
  apiKind: MarketManOrderApiKind,
  dateTimeFromUTC: string,
  dateTimeToUTC: string,
  fetchOrders: () => Promise<unknown[]>,
): Promise<{ upserted: number; error: string | null }> {
  try {
    const orders = (await fetchOrders()) as Record<string, unknown>[];
    const upserted = await bulkUpsertMarketManOrders(
      locationId,
      buyerGuid,
      apiKind,
      dateTimeFromUTC,
      dateTimeToUTC,
      orders,
    );
    return { upserted, error: null };
  } catch (e) {
    return {
      upserted: 0,
      error: `${apiKind}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

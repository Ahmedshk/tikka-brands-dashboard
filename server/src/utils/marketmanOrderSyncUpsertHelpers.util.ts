import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import { upsertMarketManOrder } from "../services/integrationCacheWrite.service.js";

export async function fetchAndUpsertMarketManOrdersForWindow(
  locationId: string,
  buyerGuid: string,
  apiKind: MarketManOrderApiKind,
  dateTimeFromUTC: string,
  dateTimeToUTC: string,
  fetchOrders: () => Promise<unknown[]>,
): Promise<{ upserted: number; error: string | null }> {
  try {
    const orders = await fetchOrders();
    let upserted = 0;
    for (const o of orders) {
      await upsertMarketManOrder(
        locationId,
        buyerGuid,
        apiKind,
        dateTimeFromUTC,
        dateTimeToUTC,
        o as Record<string, unknown>,
      );
      upserted += 1;
    }
    return { upserted, error: null };
  } catch (e) {
    return {
      upserted: 0,
      error: `${apiKind}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

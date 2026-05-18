/**
 * Cents-by-id helper for sources-of-sales segments derived from raw orders.
 *
 * Mirrors `getSourcesOfSalesFromOrders` from `square.service.ts` but stops
 * at the intermediate "cents per normalized segment id" map. Used by the
 * split-range path so rollup-derived sums and raw-order-derived sums can be
 * merged into a single cents-by-id map before final segment rendering.
 */
import type { SquareOrder } from "../services/square.service.js";
import {
  isOrderCountedForNetSales,
  orderNetSalesCents,
} from "../services/square.service.js";
import { filterSquareOrdersForDashboardDisplay } from "./squareOrderCacheHelpers.js";
import { deriveSquareSourcesOfSalesKey } from "./squareSourcesOfSalesKey.util.js";
import { normalizeSourcesOfSalesSegmentId } from "./squareSourcesOfSalesMerge.util.js";

export function sumSourcesOfSalesCentsByIdFromOrders(
  orders: readonly SquareOrder[],
): Map<string, number> {
  const byId = new Map<string, number>();
  for (const order of filterSquareOrdersForDashboardDisplay([...orders])) {
    if (!isOrderCountedForNetSales(order)) continue;
    const cents = orderNetSalesCents(order);
    if (cents <= 0) continue;
    const key = normalizeSourcesOfSalesSegmentId(
      deriveSquareSourcesOfSalesKey(order),
    );
    byId.set(key, (byId.get(key) ?? 0) + cents);
  }
  return byId;
}

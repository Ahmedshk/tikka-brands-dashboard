import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import { MarketManOrderCacheModel } from "../models/marketmanOrderCache.model.js";

/** Order-level fields shared across sent/delivery API views (not line items or date axes). */
export const MARKETMAN_ORDER_STATUS_RAW_KEYS = [
  "OrderStatus",
  "OrderStatusID",
  "OrderStatusUIName",
  "HistoryLog",
] as const;

export function siblingMarketManApiKind(
  apiKind: MarketManOrderApiKind,
): MarketManOrderApiKind {
  return apiKind === "sent" ? "delivery" : "sent";
}

/**
 * Copy lifecycle status fields from `source` onto `target` `raw` (mutates `target`).
 * Returns whether any field changed.
 */
export function copyMarketManOrderStatusOntoRaw(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): boolean {
  let changed = false;
  for (const key of MARKETMAN_ORDER_STATUS_RAW_KEYS) {
    if (!Object.hasOwn(source, key)) continue;
    const value = source[key];
    if (value === undefined) continue;
    if (target[key] !== value) {
      target[key] = value;
      changed = true;
    }
  }
  return changed;
}

export type SyncMarketManOrderStatusToSiblingResult = {
  siblingApiKind: MarketManOrderApiKind;
  /** Sibling cache row existed and was updated. */
  updated: boolean;
};

/**
 * After a webhook upsert for one `apiKind`, mirror status fields onto the other cache row
 * for the same PO. Does not change `businessDateAt`, sync windows, or non-status `raw` fields.
 */
export async function syncMarketManOrderStatusToSiblingCache(args: {
  buyerGuid: string;
  orderNumber: string;
  sourceApiKind: MarketManOrderApiKind;
  sourceOrderRaw: Record<string, unknown>;
}): Promise<SyncMarketManOrderStatusToSiblingResult> {
  const { buyerGuid, orderNumber, sourceApiKind, sourceOrderRaw } = args;
  const siblingApiKind = siblingMarketManApiKind(sourceApiKind);

  const doc = await MarketManOrderCacheModel.findOne({
    buyerGuid,
    apiKind: siblingApiKind,
    orderNumber,
  }).exec();

  if (!doc) {
    return { siblingApiKind, updated: false };
  }

  const mergedRaw = structuredClone(doc.raw) as Record<string, unknown>;
  const changed = copyMarketManOrderStatusOntoRaw(mergedRaw, sourceOrderRaw);
  if (!changed) {
    return { siblingApiKind, updated: false };
  }

  const now = new Date();
  await MarketManOrderCacheModel.updateOne(
    { _id: doc._id },
    { $set: { raw: mergedRaw, fetchedAt: now } },
  ).exec();

  return { siblingApiKind, updated: true };
}

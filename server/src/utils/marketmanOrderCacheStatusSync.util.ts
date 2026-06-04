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

function marketManCacheFetchedAtMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
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

export type ReconcileMarketManOrderStatusReason = "sibling_missing" | "unchanged";

export type ReconcileMarketManOrderStatusResult = {
  siblingApiKind: MarketManOrderApiKind;
  reconciled: boolean;
  reason?: ReconcileMarketManOrderStatusReason;
  /** Which cache row was updated when `reconciled` is true. */
  updatedTarget?: "sibling" | "source";
};

/**
 * After an upsert for one `apiKind`, align status fields with the sibling row when it
 * already exists. Latest `fetchedAt` wins (webhook or poll). Never creates the sibling row.
 */
export async function reconcileMarketManOrderStatusWithSibling(args: {
  buyerGuid: string;
  orderNumber: string;
  sourceApiKind: MarketManOrderApiKind;
  sourceOrderRaw: Record<string, unknown>;
  sourceFetchedAt: Date;
}): Promise<ReconcileMarketManOrderStatusResult> {
  const { buyerGuid, orderNumber, sourceApiKind, sourceOrderRaw, sourceFetchedAt } = args;
  const siblingApiKind = siblingMarketManApiKind(sourceApiKind);

  const sibling = await MarketManOrderCacheModel.findOne({
    buyerGuid,
    apiKind: siblingApiKind,
    orderNumber,
  }).exec();

  if (!sibling) {
    return { siblingApiKind, reconciled: false, reason: "sibling_missing" };
  }

  const sourceMs = sourceFetchedAt.getTime();
  const siblingMs = marketManCacheFetchedAtMs(sibling.fetchedAt);
  const sourceWins = sourceMs >= siblingMs;

  if (sourceWins) {
    const mergedRaw = structuredClone(sibling.raw) as Record<string, unknown>;
    const changed = copyMarketManOrderStatusOntoRaw(mergedRaw, sourceOrderRaw);
    if (!changed) {
      return { siblingApiKind, reconciled: false, reason: "unchanged" };
    }
    await MarketManOrderCacheModel.updateOne(
      { _id: sibling._id },
      { $set: { raw: mergedRaw, fetchedAt: sourceFetchedAt } },
    ).exec();
    return { siblingApiKind, reconciled: true, updatedTarget: "sibling" };
  }

  const siblingRaw = sibling.raw as Record<string, unknown>;
  const sourceDoc = await MarketManOrderCacheModel.findOne({
    buyerGuid,
    apiKind: sourceApiKind,
    orderNumber,
  }).exec();

  if (!sourceDoc) {
    return { siblingApiKind, reconciled: false, reason: "sibling_missing" };
  }

  const mergedSourceRaw = structuredClone(sourceDoc.raw) as Record<string, unknown>;
  const changed = copyMarketManOrderStatusOntoRaw(mergedSourceRaw, siblingRaw);
  if (!changed) {
    return { siblingApiKind, reconciled: false, reason: "unchanged" };
  }

  const winningFetchedAt =
    sibling.fetchedAt instanceof Date ? sibling.fetchedAt : new Date(siblingMs);

  await MarketManOrderCacheModel.updateOne(
    { _id: sourceDoc._id },
    { $set: { raw: mergedSourceRaw, fetchedAt: winningFetchedAt } },
  ).exec();

  return { siblingApiKind, reconciled: true, updatedTarget: "source" };
}

export type SyncMarketManOrderStatusToSiblingResult = {
  siblingApiKind: MarketManOrderApiKind;
  /** Sibling cache row existed and was updated. */
  updated: boolean;
};

/**
 * @deprecated Prefer {@link reconcileMarketManOrderStatusWithSibling} with an explicit `sourceFetchedAt`.
 * Kept for tests; uses current time as source freshness (legacy always-push-to-sibling when newer).
 */
export async function syncMarketManOrderStatusToSiblingCache(args: {
  buyerGuid: string;
  orderNumber: string;
  sourceApiKind: MarketManOrderApiKind;
  sourceOrderRaw: Record<string, unknown>;
}): Promise<SyncMarketManOrderStatusToSiblingResult> {
  const result = await reconcileMarketManOrderStatusWithSibling({
    ...args,
    sourceFetchedAt: new Date(),
  });
  return {
    siblingApiKind: result.siblingApiKind,
    updated: result.reconciled && result.updatedTarget === "sibling",
  };
}

/** Reconcile status for each distinct order number in a poll/webhook batch. */
export async function reconcileMarketManOrderStatusBatch(args: {
  buyerGuid: string;
  apiKind: MarketManOrderApiKind;
  orders: Record<string, unknown>[];
  fetchedAt: Date;
  orderNumberFromRaw?: (raw: Record<string, unknown>) => string;
}): Promise<void> {
  const orderNumberFromRaw =
    args.orderNumberFromRaw ??
    ((raw: Record<string, unknown>) => {
      const n = raw.OrderNumber;
      if (n == null) return "";
      return String(n).trim();
    });

  const seen = new Set<string>();
  for (const order of args.orders) {
    const orderNumber = orderNumberFromRaw(order);
    if (!orderNumber || seen.has(orderNumber)) continue;
    seen.add(orderNumber);
    await reconcileMarketManOrderStatusWithSibling({
      buyerGuid: args.buyerGuid,
      orderNumber,
      sourceApiKind: args.apiKind,
      sourceOrderRaw: order,
      sourceFetchedAt: args.fetchedAt,
    });
  }
}

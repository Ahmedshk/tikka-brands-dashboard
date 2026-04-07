/**
 * MarketMan outbound webhooks → Mongo `MarketManOrderCache` via {@link upsertMarketManOrder}.
 * Complements the 15m polling sync. Event names / payload shape: extend
 * {@link MARKETMAN_ORDER_WEBHOOK_EVENT_NAMES} and {@link extractMarketManWebhookPayload} when documented.
 */
import type { Request, Response } from "express";
import { upsertMarketManOrder } from "./integrationCacheWrite.service.js";
import { LocationRepository } from "../repositories/location.repository.js";
import {
  extractMarketManWebhookPayload,
  inferMarketManOrderApiKindFromOrderRaw,
  marketManOrderNumberStringFromRaw,
} from "../utils/marketmanWebhookExtract.util.js";
import { marketManOrderWebhookSyncWindowUtc } from "../utils/marketmanOrderWebhookSyncWindow.util.js";
import { logger } from "../utils/logger.util.js";
import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import { enrichMarketManWebhookOrder } from "../utils/marketmanWebhookOrderEnrich.util.js";
import { buildMarketManRollupForDay } from "./dailyRollupBuilder.service.js";
import { getMarketManOrderBusinessDateAt } from "../utils/marketmanOrderIndexFields.util.js";
import { marketManBusinessDateKeyFromUtcDate } from "../utils/marketManBusinessDateKey.util.js";

const locationRepository = new LocationRepository();

/**
 * When non-empty, only those event names (case-insensitive) trigger order upsert.
 * When empty, any payload that parses to buyer + order + date window is upserted — tighten after MM docs.
 */
export const MARKETMAN_ORDER_WEBHOOK_EVENT_NAMES: string[] = [];

function eventAllowsOrderUpsert(eventName: string | null): boolean {
  const allowed = MARKETMAN_ORDER_WEBHOOK_EVENT_NAMES;
  if (allowed.length === 0) return true;
  if (!eventName?.trim()) return false;
  const n = eventName.trim().toLowerCase();
  return allowed.some((a) => a.toLowerCase() === n);
}

function resolveApiKind(
  order: Record<string, unknown>,
  explicit: MarketManOrderApiKind | null,
): MarketManOrderApiKind {
  return explicit ?? inferMarketManOrderApiKindFromOrderRaw(order);
}

function mmWebhookTs(): string {
  return new Date().toISOString();
}

export async function processMarketManWebhookHttp(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    console.warn(`[${mmWebhookTs()}] MarketMan webhook: invalid body (expected JSON object)`);
    res.status(400).json({ message: "Expected JSON object body" });
    return;
  }

  const b = body as Record<string, unknown>;
  const extracted = extractMarketManWebhookPayload(b);
  const { eventName, buyerGuid, order, explicitApiKind } = extracted;

  let hoodEventId: string | null = null;
  if (typeof b.HoodEventID === "string") hoodEventId = b.HoodEventID;
  else if (typeof b.hoodEventId === "string") hoodEventId = b.hoodEventId;
  const orderNumberEarly = order ? marketManOrderNumberStringFromRaw(order) : "";

  console.log(`[${mmWebhookTs()}] MarketMan webhook: received`, {
    buyerGuid: buyerGuid ?? null,
    orderNumber: orderNumberEarly || null,
    orderId: orderNumberEarly || null,
    eventName,
    hoodEventId,
  });

  if (!eventAllowsOrderUpsert(eventName)) {
    logger.info("marketman webhook: event not configured for order upsert", {
      eventName,
    });
    console.log(`[${mmWebhookTs()}] MarketMan webhook: response`, {
      success: true,
      httpStatus: 200,
      ignored: true,
      reason: "event_not_allowed",
      buyerGuid,
      orderNumber: orderNumberEarly || null,
    });
    res.status(200).json({ received: true, ignored: true, reason: "event_not_allowed" });
    return;
  }

  if (!buyerGuid || !order) {
    logger.info("marketman webhook: no order/buyer to upsert", { eventName });
    console.log(`[${mmWebhookTs()}] MarketMan webhook: response`, {
      success: true,
      httpStatus: 200,
      ignored: true,
      reason: "unrecognized_payload",
      buyerGuid: buyerGuid ?? null,
      orderNumber: null,
    });
    res.status(200).json({
      received: true,
      ignored: true,
      reason: "unrecognized_payload",
    });
    return;
  }

  const loc = await locationRepository.findByMarketManBuyerGuid(buyerGuid);
  if (!loc?._id) {
    logger.warn("marketman webhook: unknown buyer GUID (no location)", {
      buyerGuid,
      eventName,
    });
    console.warn(`[${mmWebhookTs()}] MarketMan webhook: response`, {
      success: true,
      httpStatus: 200,
      ignored: true,
      reason: "unknown_buyer_guid",
      buyerGuid,
      orderNumber: orderNumberEarly || null,
    });
    res.status(200).json({
      received: true,
      ignored: true,
      reason: "unknown_buyer_guid",
    });
    return;
  }

  const apiKind = resolveApiKind(order, explicitApiKind);
  const window = marketManOrderWebhookSyncWindowUtc(order, apiKind);
  if (!window) {
    logger.warn("marketman webhook: could not derive sync window from order dates", {
      buyerGuid,
      eventName,
      apiKind,
    });
    console.warn(`[${mmWebhookTs()}] MarketMan webhook: response`, {
      success: true,
      httpStatus: 200,
      ignored: true,
      reason: "missing_order_date",
      buyerGuid,
      orderNumber: orderNumberEarly || null,
      apiKind,
    });
    res.status(200).json({
      received: true,
      ignored: true,
      reason: "missing_order_date",
    });
    return;
  }

  let enrichedOrder: Record<string, unknown>;
  let enrichmentPartial: boolean;
  try {
    const enriched = await enrichMarketManWebhookOrder(order, buyerGuid);
    enrichedOrder = enriched.order;
    enrichmentPartial = enriched.enrichmentPartial;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${mmWebhookTs()}] MarketMan webhook: enrich failed`, {
      buyerGuid,
      orderNumber: orderNumberEarly || null,
      error: msg,
    });
    logger.error("marketman webhook: enrich failed", {
      buyerGuid,
      orderNumber: orderNumberEarly || null,
      error: msg,
    });
    throw err;
  }

  try {
    await upsertMarketManOrder(
      String(loc._id),
      buyerGuid,
      apiKind,
      window.dateTimeFromUTC,
      window.dateTimeToUTC,
      enrichedOrder,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${mmWebhookTs()}] MarketMan webhook: upsert failed`, {
      buyerGuid,
      orderNumber: marketManOrderNumberStringFromRaw(enrichedOrder),
      apiKind,
      error: msg,
    });
    logger.error("marketman webhook: upsert failed", {
      buyerGuid,
      orderNumber: marketManOrderNumberStringFromRaw(enrichedOrder),
      apiKind,
      error: msg,
    });
    throw err;
  }

  let rollupUpdated = false;
  const businessDateAt = getMarketManOrderBusinessDateAt(enrichedOrder, apiKind);
  if (businessDateAt) {
    const businessDateKey = marketManBusinessDateKeyFromUtcDate(
      businessDateAt,
      loc.timezone ?? "UTC",
    );
    try {
      await buildMarketManRollupForDay(
        String(loc._id),
        buyerGuid,
        apiKind,
        businessDateKey,
        loc.timezone ?? "UTC",
      );
      rollupUpdated = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("marketman webhook: rollup refresh failed", {
        buyerGuid,
        apiKind,
        orderNumber: marketManOrderNumberStringFromRaw(enrichedOrder),
        error: msg,
      });
      console.error(`[${mmWebhookTs()}] MarketMan webhook: rollup refresh failed`, {
        buyerGuid,
        orderNumber: marketManOrderNumberStringFromRaw(enrichedOrder),
        apiKind,
        businessDateKey,
        error: msg,
      });
    }
  } else {
    logger.info("marketman webhook: skipped rollup (no businessDateAt)", {
      buyerGuid,
      apiKind,
      orderNumber: marketManOrderNumberStringFromRaw(enrichedOrder),
    });
    console.log(`[${mmWebhookTs()}] MarketMan webhook: rollup skipped (no businessDateAt)`, {
      buyerGuid,
      orderNumber: marketManOrderNumberStringFromRaw(enrichedOrder),
      apiKind,
    });
  }

  const orderNumberFinal = marketManOrderNumberStringFromRaw(enrichedOrder);

  logger.info("marketman webhook: order upserted", {
    eventName,
    buyerGuid,
    apiKind,
    orderNumber: orderNumberFinal,
    enrichmentPartial,
    rollupUpdated,
  });

  console.log(`[${mmWebhookTs()}] MarketMan webhook: response`, {
    success: true,
    httpStatus: 200,
    upserted: true,
    buyerGuid,
    orderNumber: orderNumberFinal,
    orderId: orderNumberFinal,
    apiKind,
    enrichmentPartial,
    rollupUpdated,
  });

  res.status(200).json({
    received: true,
    upserted: true,
    enrichmentPartial,
    rollupUpdated,
  });
}

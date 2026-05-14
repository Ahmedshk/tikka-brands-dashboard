/**
 * MarketMan outbound webhooks → Mongo `MarketManOrderCache` via {@link upsertMarketManOrder}.
 * Complements the 15m polling sync. Event names / payload shape: extend
 * {@link MARKETMAN_ORDER_WEBHOOK_EVENT_NAMES} and {@link extractMarketManWebhookPayload} when documented.
 */
import type { Request, Response } from "express";
import { LocationRepository } from "../repositories/location.repository.js";
import {
  extractMarketManWebhookPayload,
  inferMarketManOrderApiKindFromOrderRaw,
  marketManOrderNumberStringFromRaw,
} from "../utils/marketmanWebhookExtract.util.js";
import { marketManOrderWebhookSyncWindowUtc } from "../utils/marketmanOrderWebhookSyncWindow.util.js";
import { logger } from "../utils/logger.util.js";
import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import {
  marketManWebhookBodyAsRecord,
  marketManWebhookHoodEventIdFromBody,
  runMarketManWebhookOrderPipeline,
} from "../utils/marketmanWebhookHttpProcess.util.js";

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
  const b = marketManWebhookBodyAsRecord(req.body);
  if (!b) {
    console.warn(
      `[${mmWebhookTs()}] MarketMan webhook: invalid body (expected JSON object)`,
    );
    res.status(400).json({ message: "Expected JSON object body" });
    return;
  }

  const extracted = extractMarketManWebhookPayload(b);
  const { eventName, buyerGuid, order, explicitApiKind } = extracted;

  const hoodEventId = marketManWebhookHoodEventIdFromBody(b);
  const orderNumberEarly = order
    ? marketManOrderNumberStringFromRaw(order)
    : "";

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
    res
      .status(200)
      .json({ received: true, ignored: true, reason: "event_not_allowed" });
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
    logger.warn(
      "marketman webhook: could not derive sync window from order dates",
      {
        buyerGuid,
        eventName,
        apiKind,
      },
    );
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

  const { enrichmentPartial, orderNumberFinal, rollupUpdated } =
    await runMarketManWebhookOrderPipeline({
      order,
      buyerGuid,
      apiKind,
      window,
      locationMongoId: String(loc._id),
      timezone: loc.timezone ?? "UTC",
      businessStartTime: loc.businessStartTime ?? "00:00",
      orderNumberEarly,
    });

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

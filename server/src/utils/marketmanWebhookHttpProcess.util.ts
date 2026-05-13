import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import { upsertMarketManOrder } from "../services/integrationCacheWrite.service.js";
import { buildMarketManRollupForDay } from "../services/dailyRollupBuilder.service.js";
import { enrichMarketManWebhookOrder } from "./marketmanWebhookOrderEnrich.util.js";
import { getMarketManOrderBusinessDateAt } from "./marketmanOrderIndexFields.util.js";
import { marketManBusinessDateKeyFromUtcDate } from "./marketManBusinessDateKey.util.js";
import { marketManOrderNumberStringFromRaw } from "./marketmanWebhookExtract.util.js";
import { logger } from "./logger.util.js";

export function marketManWebhookBodyAsRecord(
  body: unknown,
): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export function marketManWebhookHoodEventIdFromBody(
  b: Record<string, unknown>,
): string | null {
  if (typeof b.HoodEventID === "string") return b.HoodEventID;
  if (typeof b.hoodEventId === "string") return b.hoodEventId;
  return null;
}

function marketManWebhookNowIso(): string {
  return new Date().toISOString();
}

export type MarketManWebhookOrderPipelineArgs = {
  order: Record<string, unknown>;
  buyerGuid: string;
  apiKind: MarketManOrderApiKind;
  window: { dateTimeFromUTC: string; dateTimeToUTC: string };
  locationMongoId: string;
  timezone: string;
  businessStartTime: string;
  orderNumberEarly: string;
};

export type MarketManWebhookOrderPipelineResult = {
  enrichmentPartial: boolean;
  orderNumberFinal: string;
  rollupUpdated: boolean;
};

export async function runMarketManWebhookOrderPipeline(
  args: MarketManWebhookOrderPipelineArgs,
): Promise<MarketManWebhookOrderPipelineResult> {
  const {
    order,
    buyerGuid,
    apiKind,
    window,
    locationMongoId,
    timezone,
    businessStartTime,
    orderNumberEarly,
  } = args;
  const ts = marketManWebhookNowIso();

  let enrichedOrder: Record<string, unknown>;
  let enrichmentPartial: boolean;
  try {
    const enriched = await enrichMarketManWebhookOrder(order, buyerGuid);
    enrichedOrder = enriched.order;
    enrichmentPartial = enriched.enrichmentPartial;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${ts}] MarketMan webhook: enrich failed`, {
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
      locationMongoId,
      buyerGuid,
      apiKind,
      window.dateTimeFromUTC,
      window.dateTimeToUTC,
      enrichedOrder,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${ts}] MarketMan webhook: upsert failed`, {
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
      timezone,
      businessStartTime,
    );
    try {
      await buildMarketManRollupForDay(
        locationMongoId,
        buyerGuid,
        apiKind,
        businessDateKey,
        timezone,
        businessStartTime,
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
      console.error(`[${ts}] MarketMan webhook: rollup refresh failed`, {
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
    console.log(`[${ts}] MarketMan webhook: rollup skipped (no businessDateAt)`, {
      buyerGuid,
      orderNumber: marketManOrderNumberStringFromRaw(enrichedOrder),
      apiKind,
    });
  }

  const orderNumberFinal = marketManOrderNumberStringFromRaw(enrichedOrder);
  return {
    enrichmentPartial,
    orderNumberFinal,
    rollupUpdated,
  };
}

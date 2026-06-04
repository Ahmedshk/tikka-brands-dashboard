import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";
import { upsertMarketManOrder } from "../services/integrationCacheWrite.service.js";
import type { ReconcileMarketManOrderStatusResult } from "./marketmanOrderCacheStatusSync.util.js";
import { buildMarketManRollupForDay } from "../services/dailyRollupBuilder.service.js";
import { enrichMarketManWebhookOrder } from "./marketmanWebhookOrderEnrich.util.js";
import { getMarketManOrderBusinessDateAt } from "./marketmanOrderIndexFields.util.js";
import { marketManBusinessDateKeyFromUtcDate } from "./marketManBusinessDateKey.util.js";
import { marketManOrderNumberStringFromRaw } from "./marketmanWebhookExtract.util.js";
import { logWebhookError, logWebhookInfo } from "./webhookLog.util.js";

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

export type MarketManWebhookOrderPipelineArgs = {
  order: Record<string, unknown>;
  buyerGuid: string;
  apiKind: MarketManOrderApiKind;
  window: { dateTimeFromUTC: string; dateTimeToUTC: string };
  locationMongoId: string;
  timezone: string;
  businessStartTime: string;
  orderNumberEarly: string;
  /** Full HTTP webhook JSON body (for warn/error diagnostics). */
  webhookReceived: Record<string, unknown>;
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
    webhookReceived,
  } = args;

  let enrichedOrder: Record<string, unknown>;
  let enrichmentPartial: boolean;
  try {
    const enriched = await enrichMarketManWebhookOrder(order, buyerGuid, webhookReceived);
    enrichedOrder = enriched.order;
    enrichmentPartial = enriched.enrichmentPartial;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logWebhookError(
      "MarketMan",
      "enrich failed",
      { buyerGuid, orderNumber: orderNumberEarly || null, error: msg },
      webhookReceived,
    );
    throw err;
  }

  const orderNumberForUpsert = marketManOrderNumberStringFromRaw(enrichedOrder);

  let statusReconcile: ReconcileMarketManOrderStatusResult | null = null;
  try {
    statusReconcile = await upsertMarketManOrder(
      locationMongoId,
      buyerGuid,
      apiKind,
      window.dateTimeFromUTC,
      window.dateTimeToUTC,
      enrichedOrder,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logWebhookError(
      "MarketMan",
      "upsert failed",
      {
        buyerGuid,
        orderNumber: marketManOrderNumberStringFromRaw(enrichedOrder),
        apiKind,
        error: msg,
      },
      webhookReceived,
    );
    throw err;
  }

  if (statusReconcile?.reconciled) {
    const target = statusReconcile.updatedTarget ?? "sibling";
    logWebhookInfo("MarketMan", "reconciled order status with sibling apiKind cache", {
      buyerGuid,
      orderNumber: orderNumberForUpsert,
      sourceApiKind: apiKind,
      siblingApiKind: statusReconcile.siblingApiKind,
      updatedTarget: target,
    });
  }

  let rollupUpdated = false;
  const businessDateAt = getMarketManOrderBusinessDateAt(
    enrichedOrder,
    apiKind,
  );
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
      logWebhookError(
        "MarketMan",
        "rollup refresh failed",
        {
          buyerGuid,
          orderNumber: marketManOrderNumberStringFromRaw(enrichedOrder),
          apiKind,
          businessDateKey,
          error: msg,
        },
        webhookReceived,
      );
    }
  } else {
    logWebhookInfo("MarketMan", "skipped rollup (no businessDateAt)", {
      buyerGuid,
      apiKind,
      orderNumber: marketManOrderNumberStringFromRaw(enrichedOrder),
    });
  }

  return {
    enrichmentPartial,
    orderNumberFinal: orderNumberForUpsert,
    rollupUpdated,
  };
}

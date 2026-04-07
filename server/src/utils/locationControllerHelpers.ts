import type { Response } from "express";
import type { UpdateLocationData } from "../types/location.types.js";

/**
 * Validates location id from req.params. If invalid, sends 400 and returns null.
 */
export function validateLocationId(
  id: unknown,
  res: Response
): string | null {
  if (id === undefined || Array.isArray(id)) {
    res.status(400).json({ success: false, message: "Invalid location id" });
    return null;
  }
  return id as string;
}

function normalizeLogoId(value: unknown): string | null {
  if (value === null || value === "") return null;
  return typeof value === "string" ? value.trim() : null;
}

function normalizeMarketManBuyerGuid(value: unknown): string {
  if (value === null || value === "") return "";
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Build UpdateLocationData from request body (only include defined fields).
 */
export function buildUpdateLocationData(body: Record<string, unknown>): UpdateLocationData {
  const {
    storeName,
    address,
    squareLocationId,
    squareMerchantId,
    homebaseLocationId,
    timezone,
    businessStartTime,
    squareAccessToken,
    homebaseApiKey,
    logoId,
    marketManBuyerGuid,
    squareWebhookSignatureKey,
  } = body;

  const squareTrim =
    typeof squareAccessToken === "string" ? squareAccessToken.trim() : "";
  const homebaseTrim =
    typeof homebaseApiKey === "string" ? homebaseApiKey.trim() : "";

  const updateData: UpdateLocationData = {};

  if (storeName !== undefined) updateData.storeName = storeName as string;
  if (address !== undefined) updateData.address = address as string;
  if (squareLocationId !== undefined)
    updateData.squareLocationId = squareLocationId as string;
  if (squareMerchantId !== undefined) {
    const s = typeof squareMerchantId === "string" ? squareMerchantId.trim() : "";
    updateData.squareMerchantId = s === "" ? "" : s;
  }
  if (homebaseLocationId !== undefined)
    updateData.homebaseLocationId = homebaseLocationId as string;
  if (timezone !== undefined) updateData.timezone = timezone as string;
  if (businessStartTime !== undefined)
    updateData.businessStartTime = businessStartTime as string;
  if (squareTrim) updateData.squareAccessToken = squareTrim;
  if (homebaseTrim) updateData.homebaseApiKey = homebaseTrim;
  if (logoId !== undefined) updateData.logoId = normalizeLogoId(logoId);
  if (marketManBuyerGuid !== undefined)
    updateData.marketManBuyerGuid = normalizeMarketManBuyerGuid(marketManBuyerGuid);
  if (Object.prototype.hasOwnProperty.call(body, "squareWebhookSignatureKey")) {
    updateData.squareWebhookSignatureKey =
      typeof squareWebhookSignatureKey === "string"
        ? squareWebhookSignatureKey.trim()
        : "";
  }

  return updateData;
}

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

const OPTIONAL_BODY_STRING_FIELDS = [
  "storeName",
  "address",
  "squareLocationId",
  "homebaseLocationId",
  "timezone",
  "businessStartTime",
] as const satisfies readonly (keyof UpdateLocationData)[];

function applyOptionalBodyStringFields(
  updateData: UpdateLocationData,
  body: Record<string, unknown>,
): void {
  for (const key of OPTIONAL_BODY_STRING_FIELDS) {
    const v = body[key];
    if (v !== undefined) {
      (updateData as Record<string, unknown>)[key] = v;
    }
  }
}

function applySquareMerchantId(
  updateData: UpdateLocationData,
  squareMerchantId: unknown,
): void {
  if (squareMerchantId === undefined) return;
  const s = typeof squareMerchantId === "string" ? squareMerchantId.trim() : "";
  updateData.squareMerchantId = s === "" ? "" : s;
}

function applyTokenCredentialFields(
  updateData: UpdateLocationData,
  squareTrim: string,
  homebaseTrim: string,
): void {
  if (squareTrim) updateData.squareAccessToken = squareTrim;
  if (homebaseTrim) updateData.homebaseApiKey = homebaseTrim;
}

function applyLogoAndMarketManBuyerGuid(
  updateData: UpdateLocationData,
  logoId: unknown,
  marketManBuyerGuid: unknown,
): void {
  if (logoId !== undefined) updateData.logoId = normalizeLogoId(logoId);
  if (marketManBuyerGuid !== undefined) {
    updateData.marketManBuyerGuid = normalizeMarketManBuyerGuid(marketManBuyerGuid);
  }
}

function applySquareWebhookSignatureKeyFromBody(
  updateData: UpdateLocationData,
  body: Record<string, unknown>,
  squareWebhookSignatureKey: unknown,
): void {
  if (!Object.hasOwn(body, "squareWebhookSignatureKey")) return;
  updateData.squareWebhookSignatureKey =
    typeof squareWebhookSignatureKey === "string"
      ? squareWebhookSignatureKey.trim()
      : "";
}

/**
 * Build UpdateLocationData from request body (only include defined fields).
 */
export function buildUpdateLocationData(body: Record<string, unknown>): UpdateLocationData {
  const squareTrim =
    typeof body.squareAccessToken === "string" ? body.squareAccessToken.trim() : "";
  const homebaseTrim =
    typeof body.homebaseApiKey === "string" ? body.homebaseApiKey.trim() : "";

  const updateData: UpdateLocationData = {};
  applyOptionalBodyStringFields(updateData, body);
  applySquareMerchantId(updateData, body.squareMerchantId);
  applyTokenCredentialFields(updateData, squareTrim, homebaseTrim);
  applyLogoAndMarketManBuyerGuid(updateData, body.logoId, body.marketManBuyerGuid);
  applySquareWebhookSignatureKeyFromBody(
    updateData,
    body,
    body.squareWebhookSignatureKey,
  );

  return updateData;
}

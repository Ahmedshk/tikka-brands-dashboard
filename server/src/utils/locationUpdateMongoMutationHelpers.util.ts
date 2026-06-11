import type { UpdateQuery } from "mongoose";
import type { LocationDocument } from "../models/location.model.js";
import type { UpdateLocationData } from "../types/location.types.js";
import { encryptCredentials } from "./credentialsEncryption.util.js";

function definedEntriesFromRest(
  rest: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function applyTokenEncryptionToSet(
  data: UpdateLocationData,
  $set: Record<string, unknown>,
): void {
  const squareTrim = data.squareAccessToken?.trim();
  const homebaseTrim = data.homebaseApiKey?.trim();
  if (squareTrim) {
    $set.squareAccessTokenEnc = encryptCredentials(squareTrim);
  }
  if (homebaseTrim) {
    $set.homebaseApiKeyEnc = encryptCredentials(homebaseTrim);
  }
}

function applyLogoIdWhenProvided(
  data: UpdateLocationData,
  $set: Record<string, unknown>,
): void {
  if (data.logoId !== undefined) {
    $set.logoId =
      data.logoId === null || data.logoId === "" ? null : data.logoId;
  }
}

function applyWebhookSignatureField(
  squareWebhookSignatureKey: string | undefined,
  $set: Record<string, unknown>,
  $unset: Record<string, 1>,
): void {
  if (squareWebhookSignatureKey === undefined) return;
  const w = squareWebhookSignatureKey.trim();
  if (w === "") {
    $unset.squareWebhookSignatureKeyEnc = 1;
  } else {
    $set.squareWebhookSignatureKeyEnc = encryptCredentials(w);
  }
}

function finalizeLogoNullUnset(
  data: UpdateLocationData,
  $set: Record<string, unknown>,
  $unset: Record<string, 1>,
): void {
  if (data.logoId !== null) return;
  $unset.logoId = 1;
  delete $set.logoId;
}

function applyGoogleBusinessIdFields(
  data: UpdateLocationData,
  $set: Record<string, unknown>,
  $unset: Record<string, 1>,
): void {
  if (data.googleBusinessAccountId !== undefined) {
    const id = data.googleBusinessAccountId.trim();
    if (id === "") {
      $unset.googleBusinessAccountId = 1;
      delete $set.googleBusinessAccountId;
    } else {
      $set.googleBusinessAccountId = id;
    }
  }
  if (data.googleBusinessLocationId !== undefined) {
    const id = data.googleBusinessLocationId.trim();
    if (id === "") {
      $unset.googleBusinessLocationId = 1;
      delete $set.googleBusinessLocationId;
    } else {
      $set.googleBusinessLocationId = id;
    }
  }
}

export function buildLocationMongoUpdateQuery(
  data: UpdateLocationData,
): {
  updateQuery: UpdateQuery<LocationDocument>;
  isEmptyMutation: boolean;
} {
  const {
    squareAccessToken: _omitSq,
    homebaseApiKey: _omitHb,
    squareWebhookSignatureKey,
    ...rest
  } = data;

  const $set = definedEntriesFromRest(rest as Record<string, unknown>);
  applyTokenEncryptionToSet(data, $set);

  const $unset: Record<string, 1> = {};
  applyLogoIdWhenProvided(data, $set);
  applyWebhookSignatureField(squareWebhookSignatureKey, $set, $unset);
  finalizeLogoNullUnset(data, $set, $unset);
  applyGoogleBusinessIdFields(data, $set, $unset);

  const updateQuery: UpdateQuery<LocationDocument> = {};
  if (Object.keys($set).length > 0) updateQuery.$set = $set;
  if (Object.keys($unset).length > 0) updateQuery.$unset = $unset;
  return {
    updateQuery,
    isEmptyMutation: Object.keys(updateQuery).length === 0,
  };
}

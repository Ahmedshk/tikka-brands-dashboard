import type { Request, Response } from "express";
import { verifySquareWebhookSignatureWithAnyKey } from "./squareWebhookVerify.util.js";
import { businessDateKeyForInstant } from "./businessDayUtcRange.util.js";
import {
  tryRecordSquareWebhookEvent,
  upsertSquareOrder,
  upsertSquarePayment,
  upsertSquareTeamMember,
} from "../services/integrationCacheWrite.service.js";
import { resolveLocationIdForSquare } from "../services/integrationSyncRunner.service.js";
import {
  buildSquareOrderRollupForDay,
  buildSquarePaymentRollupForDay,
} from "../services/dailyRollupBuilder.service.js";
import { rebuildSquareOrderDerivedRollupsForBusinessDay } from "../services/squareOrderMultiGranularityRollup.service.js";
import { getSquarePaymentMongoIndexFields } from "./squarePaymentMongoIndexFields.util.js";
import { getSquareOrderMongoIndexFields } from "./squareOrderMongoIndexFields.util.js";
import { logWebhookError, logWebhookReceived, logWebhookWarn } from "./webhookLog.util.js";
import {
  getSquareLocationIdFromWebhookWrapper,
  getSquareOrderIdFromWebhookWrapper,
  pickSquareOrderWebhookWrapper,
} from "./squareWebhookOrderWrapper.util.js";
import { fetchSquareOrderById } from "./squareOrderRetrieve.util.js";
import type { LocationRepository } from "../repositories/location.repository.js";
import type { LocationService } from "../services/location.service.js";

function notificationUrlFromEnv(): string {
  const base = (process.env.API_PUBLIC_URL ?? "").trim().replace(/\/$/, "");
  return `${base}/api/webhooks/square`;
}

function readRawBody(req: Request): string {
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.body === "string") return req.body;
  return JSON.stringify(req.body ?? {});
}

function tryParseJsonObject(rawBody: string): { ok: true; body: Record<string, unknown> } | { ok: false } {
  try {
    return { ok: true, body: JSON.parse(rawBody) as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function serializeFetchError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { value: String(error) };
  }
  const out: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") out.code = code;
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const causeOut: Record<string, unknown> = {
      name: cause.name,
      message: cause.message,
    };
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === "string") causeOut.code = causeCode;
    out.cause = causeOut;
  } else if (cause !== undefined) {
    out.cause = String(cause);
  }
  return out;
}

function firstNonEmptyString(values: unknown[]): string {
  for (const v of values) {
    const s = asTrimmedString(v);
    if (s) return s;
  }
  return "";
}

async function tryDedupeByEventId(body: Record<string, unknown>): Promise<{ duplicate: boolean }> {
  const eventId = firstNonEmptyString([body.event_id, body.id]);
  if (!eventId) return { duplicate: false };
  const ok = await tryRecordSquareWebhookEvent(eventId);
  return { duplicate: !ok };
}

async function loadSignatureKeys(locationService: LocationService): Promise<string[]> {
  return await locationService.getAllSquareWebhookSignatureKeysForVerification();
}

function isSignatureValid(args: {
  signatureKeys: string[];
  notificationUrl: string;
  rawBody: string;
  signature: string | undefined;
}): boolean {
  const { signatureKeys, notificationUrl, rawBody, signature } = args;
  return verifySquareWebhookSignatureWithAnyKey(signatureKeys, notificationUrl, rawBody, signature);
}

async function getTimezoneAndBusinessStartTime(args: {
  locationRepository: LocationRepository;
  locationId: string;
}): Promise<{ timezone: string; businessStartTime: string }> {
  const { locationRepository, locationId } = args;
  const locDoc = await locationRepository.findById(locationId);
  return {
    timezone: String(locDoc?.timezone ?? "UTC"),
    businessStartTime: String(locDoc?.businessStartTime ?? "00:00"),
  };
}

function responseReceived(res: Response, extra?: Record<string, unknown>): void {
  if (!extra) {
    res.status(200).json({ received: true });
    return;
  }
  res.status(200).json({ received: true, ...extra });
}

async function resolveWebhookLocationId(args: {
  merchantId: string;
  squareLocationId: string;
}): Promise<string> {
  const { merchantId, squareLocationId } = args;
  return (await resolveLocationIdForSquare(merchantId, squareLocationId)) ?? "";
}

async function handlePaymentEvent(args: {
  type: string;
  merchantId: string;
  obj: Record<string, unknown> | undefined;
  webhookBody: Record<string, unknown>;
  locationRepository: LocationRepository;
}): Promise<void> {
  const { type, merchantId, obj, webhookBody, locationRepository } = args;
  const payment = (obj?.payment ?? obj) as Record<string, unknown> | undefined;
  const squareLocationId = firstNonEmptyString([payment?.location_id, payment?.locationId]);
  const locationId = await resolveWebhookLocationId({ merchantId, squareLocationId });

  if (!locationId || !payment?.id) {
    logWebhookWarn(
      "Square",
      "payment: unknown location or id",
      { type, merchantId, squareLocationId },
      webhookBody,
    );
    return;
  }

  await upsertSquarePayment(locationId, payment);
  const { timezone, businessStartTime } = await getTimezoneAndBusinessStartTime({ locationRepository, locationId });
  const { paymentCreatedAt } = getSquarePaymentMongoIndexFields(payment);
  if (!paymentCreatedAt) {
    logWebhookWarn(
      "Square",
      "payment: skip rollup (no created_at)",
      { type, locationId },
      webhookBody,
    );
    return;
  }

  const businessDateKey = businessDateKeyForInstant(paymentCreatedAt, timezone, businessStartTime);
  try {
    await buildSquarePaymentRollupForDay(locationId, businessDateKey, timezone, businessStartTime);
  } catch (error) {
    logWebhookError(
      "Square",
      "payment: rollup failed",
      { err: error, locationId, businessDateKey },
      webhookBody,
    );
  }
}

async function handleOrderEvent(args: {
  type: string;
  merchantId: string;
  eventId: string;
  obj: Record<string, unknown> | undefined;
  webhookBody: Record<string, unknown>;
  locationRepository: LocationRepository;
  locationService: LocationService;
}): Promise<void> {
  const { type, merchantId, eventId, obj, webhookBody, locationRepository, locationService } = args;

  const wrapper = pickSquareOrderWebhookWrapper(obj);
  const squareLocationId = getSquareLocationIdFromWebhookWrapper(wrapper);
  const squareOrderId = getSquareOrderIdFromWebhookWrapper(wrapper);
  const locationId = await resolveWebhookLocationId({ merchantId, squareLocationId });

  if (!locationId || !squareOrderId) {
    logWebhookWarn(
      "Square",
      "order: unknown location or id",
      { type, merchantId, squareLocationId, squareOrderId, eventId },
      webhookBody,
    );
    return;
  }

  const withCreds = await locationService.getByIdWithCredentials(locationId);
  const squareAccessToken = withCreds?.squareAccessToken?.trim() ?? "";
  if (!squareAccessToken) {
    logWebhookWarn(
      "Square",
      "order: missing access token",
      { type, locationId, squareOrderId },
      webhookBody,
    );
    return;
  }

  let fullOrder: Record<string, unknown> | null;
  try {
    fullOrder = await fetchSquareOrderById({
      orderId: squareOrderId,
      token: squareAccessToken,
      logSource: "squareWebhookOrder",
    });
  } catch (error) {
    logWebhookError(
      "Square",
      "order: retrieve failed",
      { err: serializeFetchError(error), type, locationId, squareOrderId },
      webhookBody,
    );
    return;
  }
  if (!fullOrder) {
    logWebhookError(
      "Square",
      "order: retrieve returned no order",
      { type, locationId, squareOrderId },
      webhookBody,
    );
    return;
  }

  await upsertSquareOrder(locationId, fullOrder);
  const { timezone, businessStartTime } = await getTimezoneAndBusinessStartTime({ locationRepository, locationId });
  const { squareCreatedAt } = getSquareOrderMongoIndexFields(fullOrder);
  if (!squareCreatedAt) {
    logWebhookWarn(
      "Square",
      "order: skip rollup (no created_at)",
      { type, locationId, squareOrderId },
      webhookBody,
    );
    return;
  }

  const businessDateKey = businessDateKeyForInstant(squareCreatedAt, timezone, businessStartTime);
  try {
    await buildSquareOrderRollupForDay(locationId, businessDateKey, timezone, businessStartTime);
    await rebuildSquareOrderDerivedRollupsForBusinessDay(locationId, businessDateKey, timezone, businessStartTime);
  } catch (error) {
    logWebhookError(
      "Square",
      "order: rollup failed",
      { err: error, locationId, businessDateKey },
      webhookBody,
    );
  }
}

async function handleTeamMemberEvent(args: {
  type: string;
  merchantId: string;
  obj: Record<string, unknown> | undefined;
  webhookBody: Record<string, unknown>;
  locationRepository: LocationRepository;
}): Promise<void> {
  const { type, merchantId, obj, webhookBody, locationRepository } = args;
  const member = (obj?.team_member ?? obj) as Record<string, unknown> | undefined;
  const assigned = member?.assigned_locations as { location_ids?: string[] } | undefined;
  const locIds = assigned?.location_ids ?? [];

  let squareLocationId = Array.isArray(locIds) && locIds[0] ? String(locIds[0]) : "";
  if (!squareLocationId) {
    const fallbackLocationId = await resolveWebhookLocationId({ merchantId, squareLocationId: "" });
    if (fallbackLocationId) {
      const doc = await locationRepository.findById(fallbackLocationId);
      squareLocationId = String(doc?.squareLocationId ?? "");
    }
  }

  const locationId = await resolveWebhookLocationId({ merchantId, squareLocationId });
  if (!locationId || !member?.id) {
    logWebhookWarn(
      "Square",
      "team_member: unknown location or id",
      { type, merchantId },
      webhookBody,
    );
    return;
  }

  await upsertSquareTeamMember(locationId, member);
}

function isCatalogEvent(type: string): boolean {
  return type === "catalog.version.updated" || type.startsWith("catalog.");
}

async function dispatchWebhookEvent(args: {
  type: string;
  merchantId: string;
  eventId: string;
  obj: Record<string, unknown> | undefined;
  webhookBody: Record<string, unknown>;
  locationRepository: LocationRepository;
  locationService: LocationService;
}): Promise<string | null> {
  const { type, merchantId, eventId, obj, webhookBody, locationRepository, locationService } = args;

  if (type.startsWith("payment.")) {
    await handlePaymentEvent({ type, merchantId, obj, webhookBody, locationRepository });
    return null;
  }
  if (type.startsWith("order.")) {
    await handleOrderEvent({
      type,
      merchantId,
      eventId,
      obj,
      webhookBody,
      locationRepository,
      locationService,
    });
    return null;
  }
  if (type.startsWith("team_member.")) {
    await handleTeamMemberEvent({ type, merchantId, obj, webhookBody, locationRepository });
    return null;
  }
  if (isCatalogEvent(type)) {
    return null;
  }

  return type;
}

export async function runSquareWebhookHandler(args: {
  req: Request;
  res: Response;
  locationService: LocationService;
  locationRepository: LocationRepository;
}): Promise<void> {
  const { req, res, locationService, locationRepository } = args;
  const rawBody = readRawBody(req);
  const sig = req.get("x-square-hmacsha256-signature");
  const notificationUrl = notificationUrlFromEnv();

  logWebhookReceived("Square", {
    hasSignature: Boolean(sig),
    contentLength: rawBody.length,
    ip: req.ip ?? null,
  });

  let signatureKeys: string[];
  let parsedBody: Record<string, unknown> | undefined;
  const parsedEarly = tryParseJsonObject(rawBody);
  if (parsedEarly.ok) {
    parsedBody = parsedEarly.body;
  }

  try {
    signatureKeys = await loadSignatureKeys(locationService);
  } catch (error) {
    logWebhookError(
      "Square",
      "failed to load signature keys",
      { err: error },
      parsedBody ?? { rawBody },
    );
    res.status(503).json({ message: "Square webhook not configured" });
    return;
  }

  if (signatureKeys.length === 0) {
    res.status(503).json({
      message:
        "Square webhook not configured: set SQUARE_WEBHOOK_SIGNATURE_KEY and/or per-location keys in Location Management",
    });
    return;
  }

  if (!isSignatureValid({ signatureKeys, notificationUrl, rawBody, signature: sig ?? undefined })) {
    logWebhookWarn("Square", "invalid signature", { contentLength: rawBody.length }, parsedBody ?? {
      rawBody,
    });
    res.status(403).json({ message: "Invalid signature" });
    return;
  }

  if (!parsedEarly.ok) {
    logWebhookWarn("Square", "invalid JSON", { contentLength: rawBody.length }, { rawBody });
    res.status(400).json({ message: "Invalid JSON" });
    return;
  }

  const webhookBody = parsedEarly.body;

  const { duplicate } = await tryDedupeByEventId(webhookBody);
  if (duplicate) {
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  const type = asTrimmedString(webhookBody.type);
  const merchantId = asTrimmedString(webhookBody.merchant_id);
  const eventId = firstNonEmptyString([webhookBody.event_id, webhookBody.id]);
  const data = webhookBody.data as Record<string, unknown> | undefined;
  const obj = data?.object as Record<string, unknown> | undefined;

  logWebhookReceived("Square", {
    stage: "parsed",
    type: type || null,
    merchantId: merchantId || null,
    eventId: eventId || null,
  });

  try {
    const ignoredType = await dispatchWebhookEvent({
      type,
      merchantId,
      eventId,
      obj,
      webhookBody,
      locationRepository,
      locationService,
    });
    responseReceived(res, ignoredType ? { ignored: ignoredType } : undefined);
  } catch (error) {
    logWebhookError("Square", "handler error", { err: error, type }, webhookBody);
    res.status(500).json({ message: "Handler error" });
  }
}


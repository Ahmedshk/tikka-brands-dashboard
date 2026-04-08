import type { Request, Response } from "express";
import { verifySquareWebhookSignatureWithAnyKey } from "../utils/squareWebhookVerify.util.js";
import { businessDateKeyForInstant } from "../utils/businessDayUtcRange.util.js";
import { tryRecordSquareWebhookEvent, upsertSquareOrder, upsertSquarePayment, upsertSquareTeamMember } from "../services/integrationCacheWrite.service.js";
import { resolveLocationIdForSquare } from "../services/integrationSyncRunner.service.js";
import {
  buildSquareOrderRollupForDay,
  buildSquarePaymentRollupForDay,
} from "../services/dailyRollupBuilder.service.js";
import { rebuildSquareOrderDerivedRollupsForBusinessDay } from "../services/squareOrderMultiGranularityRollup.service.js";
import { getSquarePaymentMongoIndexFields } from "../utils/squarePaymentMongoIndexFields.util.js";
import { getSquareOrderMongoIndexFields } from "../utils/squareOrderMongoIndexFields.util.js";
import { logger } from "../utils/logger.util.js";
import { LocationRepository } from "../repositories/location.repository.js";
import { LocationService } from "../services/location.service.js";

const locationRepository = new LocationRepository();
const locationService = new LocationService();

function notificationUrlFromEnv(): string {
  const base = (process.env.API_PUBLIC_URL ?? "").trim().replace(/\/$/, "");
  return `${base}/api/webhooks/square`;
}

function readRawBody(req: Request): string {
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.body === "string") return req.body;
  return JSON.stringify(req.body ?? {});
}

export async function handleSquareWebhook(req: Request, res: Response): Promise<void> {
  const rawBody = readRawBody(req);
  const sig = req.get("x-square-hmacsha256-signature");
  const notificationUrl = notificationUrlFromEnv();

  let signatureKeys: string[];
  try {
    signatureKeys = await locationService.getAllSquareWebhookSignatureKeysForVerification();
  } catch (err) {
    logger.error("Square webhook: failed to load signature keys", { err });
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

  if (
    !verifySquareWebhookSignatureWithAnyKey(
      signatureKeys,
      notificationUrl,
      rawBody,
      sig,
    )
  ) {
    res.status(403).json({ message: "Invalid signature" });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    res.status(400).json({ message: "Invalid JSON" });
    return;
  }

  const eventId = String(body.event_id ?? body.id ?? "").trim();
  if (eventId) {
    const ok = await tryRecordSquareWebhookEvent(eventId);
    if (!ok) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
  }

  const type = String(body.type ?? "");
  const merchantId = String(body.merchant_id ?? "").trim();
  const data = body.data as Record<string, unknown> | undefined;
  const obj = data?.object as Record<string, unknown> | undefined;

  try {
    if (type.startsWith("payment.")) {
      const payment = (obj?.payment ?? obj) as Record<string, unknown> | undefined;
      const squareLocationId = String(
        payment?.location_id ?? payment?.locationId ?? "",
      ).trim();
      const locationId = await resolveLocationIdForSquare(
        merchantId,
        squareLocationId,
      );
      if (!locationId || !payment?.id) {
        logger.warn("Square webhook payment: unknown location or id", {
          type,
          merchantId,
          squareLocationId,
        });
        res.status(200).json({ received: true });
        return;
      }
      await upsertSquarePayment(locationId, payment);
      const locDoc = await locationRepository.findById(locationId);
      const timezone = String(locDoc?.timezone ?? "UTC");
      const businessStartTime = String(locDoc?.businessStartTime ?? "00:00");
      const { paymentCreatedAt } = getSquarePaymentMongoIndexFields(payment);
      if (!paymentCreatedAt) {
        logger.warn("Square webhook payment: skip rollup (no created_at)", {
          type,
          locationId,
        });
      } else {
        const businessDateKey = businessDateKeyForInstant(
          paymentCreatedAt,
          timezone,
          businessStartTime,
        );
        try {
          await buildSquarePaymentRollupForDay(
            locationId,
            businessDateKey,
            timezone,
            businessStartTime,
          );
        } catch (rollErr) {
          logger.error("Square webhook payment: rollup failed", {
            err: rollErr,
            locationId,
            businessDateKey,
          });
        }
      }
      res.status(200).json({ received: true });
      return;
    }

    if (type.startsWith("order.")) {
      const order = (obj?.order ?? obj) as Record<string, unknown> | undefined;
      const squareLocationId = String(
        order?.location_id ?? order?.locationId ?? "",
      ).trim();
      const locationId = await resolveLocationIdForSquare(
        merchantId,
        squareLocationId,
      );
      if (!locationId || !order?.id) {
        logger.warn("Square webhook order: unknown location or id", {
          type,
          merchantId,
          squareLocationId,
        });
        res.status(200).json({ received: true });
        return;
      }
      await upsertSquareOrder(locationId, order);
      const locDoc = await locationRepository.findById(locationId);
      const timezone = String(locDoc?.timezone ?? "UTC");
      const businessStartTime = String(locDoc?.businessStartTime ?? "00:00");
      const { squareCreatedAt } = getSquareOrderMongoIndexFields(order);
      if (!squareCreatedAt) {
        logger.warn("Square webhook order: skip rollup (no created_at)", {
          type,
          locationId,
        });
      } else {
        const businessDateKey = businessDateKeyForInstant(
          squareCreatedAt,
          timezone,
          businessStartTime,
        );
        try {
          await buildSquareOrderRollupForDay(
            locationId,
            businessDateKey,
            timezone,
            businessStartTime,
          );
          await rebuildSquareOrderDerivedRollupsForBusinessDay(
            locationId,
            businessDateKey,
            timezone,
            businessStartTime,
          );
        } catch (rollErr) {
          logger.error("Square webhook order: rollup failed", {
            err: rollErr,
            locationId,
            businessDateKey,
          });
        }
      }
      res.status(200).json({ received: true });
      return;
    }

    if (type.startsWith("team_member.")) {
      const member = (obj?.team_member ?? obj) as
        | Record<string, unknown>
        | undefined;
      const assigned = member?.assigned_locations as
        | { location_ids?: string[] }
        | undefined;
      const locIds = assigned?.location_ids ?? [];
      let squareLocationId =
        Array.isArray(locIds) && locIds[0] ? String(locIds[0]) : "";
      if (!squareLocationId) {
        const loc = await resolveLocationIdForSquare(merchantId, "");
        if (loc) {
          const doc = await locationRepository.findById(loc);
          squareLocationId = String(doc?.squareLocationId ?? "");
        }
      }
      const locationId = await resolveLocationIdForSquare(
        merchantId,
        squareLocationId,
      );
      if (!locationId || !member?.id) {
        logger.warn("Square webhook team_member: unknown location or id", {
          type,
          merchantId,
        });
        res.status(200).json({ received: true });
        return;
      }
      await upsertSquareTeamMember(locationId, member);
      res.status(200).json({ received: true });
      return;
    }

    if (type === "catalog.version.updated" || type.startsWith("catalog.")) {
      // Catalog is refreshed on a daily Agenda job and via admin Data Sync — not on every webhook.
      res.status(200).json({ received: true });
      return;
    }

    res.status(200).json({ received: true, ignored: type });
  } catch (err) {
    logger.error("Square webhook handler error", { err, type });
    res.status(500).json({ message: "Handler error" });
  }
}

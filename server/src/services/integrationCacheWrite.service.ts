import mongoose from "mongoose";
import { SquarePaymentModel } from "../models/squarePayment.model.js";
import { SquareOrderModel } from "../models/squareOrder.model.js";
import { SquareCatalogObjectModel } from "../models/squareCatalogObject.model.js";
import { SquareTeamMemberModel } from "../models/squareTeamMember.model.js";
import { HomebaseTimecardModel } from "../models/homebaseTimecard.model.js";
import { MarketManValidCountDatesModel } from "../models/marketmanValidCountDates.model.js";
import { MarketManActualTheoSnapshotModel } from "../models/marketmanActualTheoSnapshot.model.js";
import { MarketManWasteSnapshotModel } from "../models/marketmanWasteSnapshot.model.js";
import {
  MarketManOrderCacheModel,
  type MarketManOrderApiKind,
} from "../models/marketmanOrderCache.model.js";
import { SquareWebhookEventModel } from "../models/squareWebhookEvent.model.js";
import { getSquareOrderMongoIndexFields } from "../utils/squareOrderMongoIndexFields.util.js";
import { getSquarePaymentMongoIndexFields } from "../utils/squarePaymentMongoIndexFields.util.js";
import { getHomebaseTimecardClockInAt } from "../utils/homebaseTimecardIndexFields.util.js";
import { getMarketManOrderBusinessDateAt } from "../utils/marketmanOrderIndexFields.util.js";

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export async function upsertSquarePayment(
  locationId: string,
  payment: Record<string, unknown>,
): Promise<void> {
  const squareId = String(payment.id ?? "").trim();
  if (!squareId) return;
  const raw = payment as Record<string, unknown>;
  const idx = getSquarePaymentMongoIndexFields(raw);
  await SquarePaymentModel.findOneAndUpdate(
    { squareId },
    {
      squareId,
      locationId: toObjectId(locationId),
      raw,
      paymentCreatedAt: idx.paymentCreatedAt,
      paymentStatus: idx.paymentStatus,
    },
    { upsert: true, new: true },
  ).exec();
}

/** Persists Square order JSON in `raw`. Document `createdAt`/`updatedAt` are upsert times only. */
export async function upsertSquareOrder(
  locationId: string,
  order: Record<string, unknown>,
): Promise<void> {
  const squareId = String(order.id ?? "").trim();
  if (!squareId) return;
  const raw = order as Record<string, unknown>;
  const idx = getSquareOrderMongoIndexFields(raw);
  await SquareOrderModel.findOneAndUpdate(
    { squareId },
    {
      squareId,
      locationId: toObjectId(locationId),
      raw,
      squareCreatedAt: idx.squareCreatedAt,
      excludedFromDashboard: idx.excludedFromDashboard,
    },
    { upsert: true, new: true },
  ).exec();
}

export async function upsertSquareCatalogObject(
  locationId: string,
  obj: Record<string, unknown>,
): Promise<void> {
  const objectId = String(obj.id ?? "").trim();
  if (!objectId) return;
  const versionRaw = obj.version;
  const version =
    typeof versionRaw === "bigint"
      ? Number(versionRaw)
      : typeof versionRaw === "number"
        ? versionRaw
        : versionRaw != null
          ? Number(versionRaw)
          : undefined;
  await SquareCatalogObjectModel.findOneAndUpdate(
    { objectId, locationId: toObjectId(locationId) },
    {
      objectId,
      locationId: toObjectId(locationId),
      ...(version != null && !Number.isNaN(version) ? { version } : {}),
      raw: obj,
    },
    { upsert: true, new: true },
  ).exec();
}

export async function upsertSquareTeamMember(
  locationId: string,
  member: Record<string, unknown>,
): Promise<void> {
  const squareId = String(member.id ?? "").trim();
  if (!squareId) return;
  await SquareTeamMemberModel.findOneAndUpdate(
    { squareId, locationId: toObjectId(locationId) },
    {
      squareId,
      locationId: toObjectId(locationId),
      raw: member as Record<string, unknown>,
    },
    { upsert: true, new: true },
  ).exec();
}

export async function upsertHomebaseTimecard(
  locationId: string,
  card: Record<string, unknown>,
): Promise<void> {
  const id = card.id;
  const homebaseId = typeof id === "number" ? id : Number(id);
  if (!Number.isFinite(homebaseId)) return;
  const raw = card as Record<string, unknown>;
  await HomebaseTimecardModel.findOneAndUpdate(
    { homebaseId, locationId: toObjectId(locationId) },
    {
      homebaseId,
      locationId: toObjectId(locationId),
      raw,
      clockInAt: getHomebaseTimecardClockInAt(raw),
    },
    { upsert: true, new: true },
  ).exec();
}

export async function upsertMarketManValidCountDates(
  locationId: string,
  buyerGuid: string,
  startDates: string[],
  endDates: string[],
): Promise<void> {
  const fetchedAt = new Date();
  await MarketManValidCountDatesModel.findOneAndUpdate(
    { locationId: toObjectId(locationId), buyerGuid },
    {
      locationId: toObjectId(locationId),
      buyerGuid,
      startDates,
      endDates,
      fetchedAt,
    },
    { upsert: true, new: true },
  ).exec();
}

export async function upsertMarketManActualTheoSnapshot(
  locationId: string,
  buyerGuid: string,
  syncDateKey: string,
  startDateUTC: string,
  endDateUTC: string,
  raw: Record<string, unknown>,
): Promise<void> {
  await MarketManActualTheoSnapshotModel.findOneAndUpdate(
    {
      locationId: toObjectId(locationId),
      buyerGuid,
      syncDateKey,
    },
    {
      locationId: toObjectId(locationId),
      buyerGuid,
      syncDateKey,
      startDateUTC,
      endDateUTC,
      raw,
      fetchedAt: new Date(),
    },
    { upsert: true, new: true },
  ).exec();
}

export async function upsertMarketManWasteSnapshot(
  locationId: string,
  buyerGuid: string,
  syncDateKey: string,
  startDateUTC: string,
  endDateUTC: string,
  raw: Record<string, unknown>,
): Promise<void> {
  await MarketManWasteSnapshotModel.findOneAndUpdate(
    {
      locationId: toObjectId(locationId),
      buyerGuid,
      syncDateKey,
    },
    {
      locationId: toObjectId(locationId),
      buyerGuid,
      syncDateKey,
      startDateUTC,
      endDateUTC,
      raw,
      fetchedAt: new Date(),
    },
    { upsert: true, new: true },
  ).exec();
}

export async function upsertMarketManOrder(
  locationId: string,
  buyerGuid: string,
  apiKind: MarketManOrderApiKind,
  dateTimeFromUTC: string,
  dateTimeToUTC: string,
  order: Record<string, unknown>,
): Promise<void> {
  const orderNumber = String(order.OrderNumber ?? "").trim();
  if (!orderNumber) return;
  const raw = order as Record<string, unknown>;
  await MarketManOrderCacheModel.findOneAndUpdate(
    { buyerGuid, apiKind, orderNumber },
    {
      locationId: toObjectId(locationId),
      buyerGuid,
      apiKind,
      orderNumber,
      raw,
      dateTimeFromUTC,
      dateTimeToUTC,
      fetchedAt: new Date(),
      businessDateAt: getMarketManOrderBusinessDateAt(raw, apiKind),
    },
    { upsert: true, new: true },
  ).exec();
}

/** Returns false if duplicate (already processed). */
export async function tryRecordSquareWebhookEvent(eventId: string): Promise<boolean> {
  try {
    await SquareWebhookEventModel.create({ eventId });
    return true;
  } catch {
    return false;
  }
}

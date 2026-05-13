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
import { squareRawIdAsString } from "../utils/squareRawIdString.util.js";
import { catalogObjectVersionFromUnknown } from "../utils/squareCatalogObjectVersionHelpers.util.js";
import { getHomebaseTimecardClockInAt } from "../utils/homebaseTimecardIndexFields.util.js";
import { getMarketManOrderBusinessDateAt } from "../utils/marketmanOrderIndexFields.util.js";
import { marketManOrderNumberAsString } from "../utils/marketManOrderNumberString.util.js";

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export async function upsertSquarePayment(
  locationId: string,
  payment: Record<string, unknown>,
): Promise<void> {
  const squareId = squareRawIdAsString(payment.id, "");
  if (!squareId) return;
  const idx = getSquarePaymentMongoIndexFields(payment);
  await SquarePaymentModel.findOneAndUpdate(
    { squareId },
    {
      squareId,
      locationId: toObjectId(locationId),
      raw: payment,
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
  const squareId = squareRawIdAsString(order.id, "");
  if (!squareId) return;
  const idx = getSquareOrderMongoIndexFields(order);
  await SquareOrderModel.findOneAndUpdate(
    { squareId },
    {
      squareId,
      locationId: toObjectId(locationId),
      raw: order,
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
  const objectId = squareRawIdAsString(obj.id, "");
  if (!objectId) return;
  const version = catalogObjectVersionFromUnknown(obj.version);
  const locationOid = toObjectId(locationId);
  const updateBody: {
    objectId: string;
    locationId: mongoose.Types.ObjectId;
    raw: Record<string, unknown>;
    version?: number;
  } = {
    objectId,
    locationId: locationOid,
    raw: obj,
  };
  if (version != null && Number.isFinite(version)) {
    updateBody.version = version;
  }
  await SquareCatalogObjectModel.findOneAndUpdate(
    { objectId, locationId: locationOid },
    updateBody,
    { upsert: true, new: true },
  ).exec();
}

export async function upsertSquareTeamMember(
  locationId: string,
  member: Record<string, unknown>,
): Promise<void> {
  const squareId = squareRawIdAsString(member.id, "");
  if (!squareId) return;
  await SquareTeamMemberModel.findOneAndUpdate(
    { squareId, locationId: toObjectId(locationId) },
    {
      squareId,
      locationId: toObjectId(locationId),
      raw: member,
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
  await HomebaseTimecardModel.findOneAndUpdate(
    { homebaseId, locationId: toObjectId(locationId) },
    {
      homebaseId,
      locationId: toObjectId(locationId),
      raw: card,
      clockInAt: getHomebaseTimecardClockInAt(card),
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
  const orderNumber = marketManOrderNumberAsString(order.OrderNumber);
  if (!orderNumber) return;
  await MarketManOrderCacheModel.findOneAndUpdate(
    { buyerGuid, apiKind, orderNumber },
    {
      locationId: toObjectId(locationId),
      buyerGuid,
      apiKind,
      orderNumber,
      raw: order,
      dateTimeFromUTC,
      dateTimeToUTC,
      fetchedAt: new Date(),
      businessDateAt: getMarketManOrderBusinessDateAt(order, apiKind),
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

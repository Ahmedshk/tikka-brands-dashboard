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
import { yieldEventLoop } from "../utils/eventLoopYield.util.js";
import { invalidateOrderRangeCacheForLocation } from "../utils/orderRangeCache.util.js";
import { invalidateOrdersEmptyCacheForLocation } from "../utils/rollupReadCache.util.js";
import { invalidateRollupExistsByDateForLocation } from "../utils/rollupExistsByDateCache.util.js";
import { invalidateTimecardRangeCacheForLocation } from "../utils/timecardRangeCache.util.js";

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

/**
 * Maximum number of upsert operations per Mongo `bulkWrite` call. 500 keeps
 * the BSON command well below Mongo's 16MB document limit even for raw
 * Square/Homebase/MarketMan payloads, and is large enough that round-trip
 * overhead is amortised.
 */
const BULK_BATCH_SIZE = 500;

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
  invalidateOrderRangeCacheForLocation(locationId);
  invalidateOrdersEmptyCacheForLocation(locationId);
  invalidateRollupExistsByDateForLocation(locationId);
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
  invalidateTimecardRangeCacheForLocation(locationId);
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

// -------------------------------------------------------------------------
// Bulk upsert helpers
// -------------------------------------------------------------------------
// Used by the integration sync runner instead of N x findOneAndUpdate to
// avoid pinning the event loop for minutes during wide-range syncs. Each
// helper batches at BULK_BATCH_SIZE and yields between batches so /healthz
// and /api/integration-sync/active stay responsive on the same event loop.
// All ops use `ordered: false` so a single bad doc does not abort the batch.

interface BulkUpsertOp<TFilter, TUpdate> {
  updateOne: {
    filter: TFilter;
    update: TUpdate;
    upsert: true;
  };
}

async function flushBulkBatches<TOp>(
  model: { bulkWrite: (ops: TOp[], options: { ordered: false }) => Promise<unknown> },
  ops: TOp[],
): Promise<number> {
  if (ops.length === 0) return 0;
  let processed = 0;
  for (let i = 0; i < ops.length; i += BULK_BATCH_SIZE) {
    const batch = ops.slice(i, i + BULK_BATCH_SIZE);
    await model.bulkWrite(batch, { ordered: false });
    processed += batch.length;
    await yieldEventLoop();
  }
  return processed;
}

export async function bulkUpsertSquarePayments(
  locationId: string,
  payments: Record<string, unknown>[],
): Promise<number> {
  const locOid = toObjectId(locationId);
  type Filter = { squareId: string };
  type Update = {
    squareId: string;
    locationId: mongoose.Types.ObjectId;
    raw: Record<string, unknown>;
    paymentCreatedAt: ReturnType<typeof getSquarePaymentMongoIndexFields>["paymentCreatedAt"];
    paymentStatus: ReturnType<typeof getSquarePaymentMongoIndexFields>["paymentStatus"];
  };
  const ops: BulkUpsertOp<Filter, Update>[] = [];
  for (const payment of payments) {
    const squareId = squareRawIdAsString(payment.id, "");
    if (!squareId) continue;
    const idx = getSquarePaymentMongoIndexFields(payment);
    ops.push({
      updateOne: {
        filter: { squareId },
        update: {
          squareId,
          locationId: locOid,
          raw: payment,
          paymentCreatedAt: idx.paymentCreatedAt,
          paymentStatus: idx.paymentStatus,
        },
        upsert: true,
      },
    });
  }
  return flushBulkBatches(SquarePaymentModel, ops);
}

export async function bulkUpsertSquareOrders(
  locationId: string,
  orders: Record<string, unknown>[],
): Promise<number> {
  const locOid = toObjectId(locationId);
  type Filter = { squareId: string };
  type Update = {
    squareId: string;
    locationId: mongoose.Types.ObjectId;
    raw: Record<string, unknown>;
    squareCreatedAt: ReturnType<typeof getSquareOrderMongoIndexFields>["squareCreatedAt"];
    excludedFromDashboard: ReturnType<typeof getSquareOrderMongoIndexFields>["excludedFromDashboard"];
  };
  const ops: BulkUpsertOp<Filter, Update>[] = [];
  for (const order of orders) {
    const squareId = squareRawIdAsString(order.id, "");
    if (!squareId) continue;
    const idx = getSquareOrderMongoIndexFields(order);
    ops.push({
      updateOne: {
        filter: { squareId },
        update: {
          squareId,
          locationId: locOid,
          raw: order,
          squareCreatedAt: idx.squareCreatedAt,
          excludedFromDashboard: idx.excludedFromDashboard,
        },
        upsert: true,
      },
    });
  }
  return flushBulkBatches(SquareOrderModel, ops);
}

export async function bulkUpsertSquareCatalogObjects(
  locationId: string,
  objects: Record<string, unknown>[],
): Promise<number> {
  const locOid = toObjectId(locationId);
  type Filter = { objectId: string; locationId: mongoose.Types.ObjectId };
  type Update = {
    objectId: string;
    locationId: mongoose.Types.ObjectId;
    raw: Record<string, unknown>;
    version?: number;
  };
  const ops: BulkUpsertOp<Filter, Update>[] = [];
  for (const obj of objects) {
    const objectId = squareRawIdAsString(obj.id, "");
    if (!objectId) continue;
    const version = catalogObjectVersionFromUnknown(obj.version);
    const update: Update = {
      objectId,
      locationId: locOid,
      raw: obj,
    };
    if (version != null && Number.isFinite(version)) update.version = version;
    ops.push({
      updateOne: {
        filter: { objectId, locationId: locOid },
        update,
        upsert: true,
      },
    });
  }
  return flushBulkBatches(SquareCatalogObjectModel, ops);
}

export async function bulkUpsertSquareTeamMembers(
  locationId: string,
  members: Record<string, unknown>[],
): Promise<number> {
  const locOid = toObjectId(locationId);
  type Filter = { squareId: string; locationId: mongoose.Types.ObjectId };
  type Update = {
    squareId: string;
    locationId: mongoose.Types.ObjectId;
    raw: Record<string, unknown>;
  };
  const ops: BulkUpsertOp<Filter, Update>[] = [];
  for (const member of members) {
    const squareId = squareRawIdAsString(member.id, "");
    if (!squareId) continue;
    ops.push({
      updateOne: {
        filter: { squareId, locationId: locOid },
        update: { squareId, locationId: locOid, raw: member },
        upsert: true,
      },
    });
  }
  return flushBulkBatches(SquareTeamMemberModel, ops);
}

export async function bulkUpsertHomebaseTimecards(
  locationId: string,
  cards: Record<string, unknown>[],
): Promise<number> {
  const locOid = toObjectId(locationId);
  type Filter = { homebaseId: number; locationId: mongoose.Types.ObjectId };
  type Update = {
    homebaseId: number;
    locationId: mongoose.Types.ObjectId;
    raw: Record<string, unknown>;
    clockInAt: ReturnType<typeof getHomebaseTimecardClockInAt>;
  };
  const ops: BulkUpsertOp<Filter, Update>[] = [];
  for (const card of cards) {
    const id = card.id;
    const homebaseId = typeof id === "number" ? id : Number(id);
    if (!Number.isFinite(homebaseId)) continue;
    ops.push({
      updateOne: {
        filter: { homebaseId, locationId: locOid },
        update: {
          homebaseId,
          locationId: locOid,
          raw: card,
          clockInAt: getHomebaseTimecardClockInAt(card),
        },
        upsert: true,
      },
    });
  }
  return flushBulkBatches(HomebaseTimecardModel, ops);
}

export async function bulkUpsertMarketManOrders(
  locationId: string,
  buyerGuid: string,
  apiKind: MarketManOrderApiKind,
  dateTimeFromUTC: string,
  dateTimeToUTC: string,
  orders: Record<string, unknown>[],
): Promise<number> {
  const locOid = toObjectId(locationId);
  const fetchedAt = new Date();
  type Filter = { buyerGuid: string; apiKind: MarketManOrderApiKind; orderNumber: string };
  type Update = {
    locationId: mongoose.Types.ObjectId;
    buyerGuid: string;
    apiKind: MarketManOrderApiKind;
    orderNumber: string;
    raw: Record<string, unknown>;
    dateTimeFromUTC: string;
    dateTimeToUTC: string;
    fetchedAt: Date;
    businessDateAt: ReturnType<typeof getMarketManOrderBusinessDateAt>;
  };
  const ops: BulkUpsertOp<Filter, Update>[] = [];
  for (const order of orders) {
    const orderNumber = marketManOrderNumberAsString(order.OrderNumber);
    if (!orderNumber) continue;
    ops.push({
      updateOne: {
        filter: { buyerGuid, apiKind, orderNumber },
        update: {
          locationId: locOid,
          buyerGuid,
          apiKind,
          orderNumber,
          raw: order,
          dateTimeFromUTC,
          dateTimeToUTC,
          fetchedAt,
          businessDateAt: getMarketManOrderBusinessDateAt(order, apiKind),
        },
        upsert: true,
      },
    });
  }
  return flushBulkBatches(MarketManOrderCacheModel, ops);
}

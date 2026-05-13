import { LocationRepository } from "../repositories/location.repository.js";
import { LocationService } from "./location.service.js";
import {
  listPaymentsInRange,
  searchCatalogObjects,
} from "./squareIngest.service.js";
import { fetchOrdersInRange, searchTeamMembers } from "./square.service.js";
import type { TimeRange } from "../utils/businessHours.util.js";
import { getTimecardsForDateRange } from "./homebase.service.js";
import {
  getValidCountDates,
  getOrderTrackerRanges,
  getOrdersByDeliveryDate,
  getOrdersBySentDate,
} from "./marketman.service.js";
import { formatMarketManDateUtc } from "./marketman.client.js";
import {
  upsertSquarePayment,
  upsertSquareOrder,
  upsertSquareCatalogObject,
  upsertSquareTeamMember,
  upsertHomebaseTimecard,
  upsertMarketManValidCountDates,
  upsertMarketManOrder,
} from "./integrationCacheWrite.service.js";
import { fetchAndUpsertMarketManOrdersForWindow } from "../utils/marketmanOrderSyncUpsertHelpers.util.js";
import { logger } from "../utils/logger.util.js";
import { getZonedCalendarDayUtcBounds } from "../utils/integrationSyncZonedDayBounds.util.js";
import type { IntegrationSyncResource } from "../models/integrationSyncLog.model.js";

const locationRepository = new LocationRepository();
const locationService = new LocationService();

export interface SyncCounts {
  upserted: number;
  errors: string[];
}

export async function syncSquarePaymentsForLocation(
  locationId: string,
  begin: Date,
  end: Date,
): Promise<SyncCounts> {
  const creds = await locationService.getByIdWithCredentials(locationId);
  if (!creds?.squareAccessToken) {
    return { upserted: 0, errors: ["No Square token"] };
  }
  const squareLocationId = creds.location.squareLocationId;
  const payments = await listPaymentsInRange(
    creds.squareAccessToken,
    squareLocationId,
    begin.toISOString(),
    end.toISOString(),
  );
  let n = 0;
  for (const p of payments) {
    await upsertSquarePayment(locationId, p as Record<string, unknown>);
    n += 1;
  }
  return { upserted: n, errors: [] };
}

export async function syncSquareOrdersForLocation(
  locationId: string,
  range: TimeRange,
): Promise<SyncCounts> {
  const creds = await locationService.getByIdWithCredentials(locationId);
  if (!creds?.squareAccessToken) {
    return { upserted: 0, errors: ["No Square token"] };
  }
  const orders = await fetchOrdersInRange(
    creds.location.squareLocationId,
    range,
    creds.squareAccessToken,
  );
  let n = 0;
  for (const o of orders) {
    await upsertSquareOrder(
      locationId,
      o as unknown as Record<string, unknown>,
    );
    n += 1;
  }
  return { upserted: n, errors: [] };
}

export async function syncSquareCatalogForLocation(
  locationId: string,
): Promise<SyncCounts> {
  const creds = await locationService.getByIdWithCredentials(locationId);
  if (!creds?.squareAccessToken) {
    return { upserted: 0, errors: ["No Square token"] };
  }
  const objects = await searchCatalogObjects(creds.squareAccessToken);
  let n = 0;
  for (const obj of objects) {
    await upsertSquareCatalogObject(locationId, obj);
    n += 1;
  }
  return { upserted: n, errors: [] };
}

export async function syncSquareTeamMembersForLocation(
  locationId: string,
): Promise<SyncCounts> {
  const creds = await locationService.getByIdWithCredentials(locationId);
  if (!creds?.squareAccessToken) {
    return { upserted: 0, errors: ["No Square token"] };
  }
  const members = await searchTeamMembers(creds.location.squareLocationId, {
    accessToken: creds.squareAccessToken,
  });
  let n = 0;
  for (const m of members) {
    await upsertSquareTeamMember(
      locationId,
      m as unknown as Record<string, unknown>,
    );
    n += 1;
  }
  return { upserted: n, errors: [] };
}

export async function syncHomebaseTimecardsForLocation(
  locationId: string,
  startAt: string,
  endAt: string,
): Promise<SyncCounts> {
  const creds = await locationService.getByIdWithCredentials(locationId);
  if (!creds?.homebaseApiKey) {
    return { upserted: 0, errors: ["No Homebase key"] };
  }
  const homebaseUuid = creds.location.homebaseLocationId?.trim();
  if (!homebaseUuid) {
    return { upserted: 0, errors: ["No Homebase location ID"] };
  }
  const cards = await getTimecardsForDateRange(homebaseUuid, startAt, endAt, {
    apiKey: creds.homebaseApiKey,
  });
  let n = 0;
  for (const c of cards) {
    await upsertHomebaseTimecard(
      locationId,
      c as unknown as Record<string, unknown>,
    );
    n += 1;
  }
  return { upserted: n, errors: [] };
}

/** Sliding window for recurring job: last 72h clock-in. */
export function homebaseSlidingWindowIso(): { startAt: string; endAt: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 72 * 60 * 60 * 1000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export async function syncMarketManValidCountDatesForLocation(
  locationId: string,
): Promise<SyncCounts> {
  const loc = await locationRepository.findById(locationId);
  const buyerGuid = loc?.marketManBuyerGuid?.trim();
  if (!buyerGuid) {
    return { upserted: 0, errors: ["No MarketMan buyer GUID"] };
  }
  const data = await getValidCountDates(buyerGuid);
  if (!data) {
    return { upserted: 0, errors: ["GetValidCountDates failed"] };
  }
  await upsertMarketManValidCountDates(
    locationId,
    buyerGuid,
    data.startDates,
    data.endDates,
  );
  return { upserted: 1, errors: [] };
}

export async function syncMarketManOrdersTodayForLocation(
  locationId: string,
  timezone: string,
  buyerGuid: string,
): Promise<SyncCounts> {
  const errors: string[] = [];
  let upserted = 0;
  const { ranges } = getOrderTrackerRanges("today", timezone);
  for (const r of ranges) {
    try {
      const delivery = await getOrdersByDeliveryDate(
        buyerGuid,
        r.dateTimeFromUTC,
        r.dateTimeToUTC,
      );
      for (const o of delivery) {
        await upsertMarketManOrder(
          locationId,
          buyerGuid,
          "delivery",
          r.dateTimeFromUTC,
          r.dateTimeToUTC,
          o as unknown as Record<string, unknown>,
        );
        upserted += 1;
      }
    } catch (e) {
      errors.push(`delivery: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const sent = await getOrdersBySentDate(
        buyerGuid,
        r.dateTimeFromUTC,
        r.dateTimeToUTC,
      );
      for (const o of sent) {
        await upsertMarketManOrder(
          locationId,
          buyerGuid,
          "sent",
          r.dateTimeFromUTC,
          r.dateTimeToUTC,
          o as unknown as Record<string, unknown>,
        );
        upserted += 1;
      }
    } catch (e) {
      errors.push(`sent: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { upserted, errors };
}

/**
 * Fetch MarketMan orders for a single UTC window (manual sync with start/end).
 * Periodic jobs use {@link syncMarketManOrdersTodayForLocation} instead.
 */
export async function syncMarketManOrdersInUtcRangeForLocation(
  locationId: string,
  buyerGuid: string,
  kind:
    | "marketman_orders_both"
    | "marketman_orders_sent"
    | "marketman_orders_delivery",
  dateTimeFromUTC: string,
  dateTimeToUTC: string,
): Promise<SyncCounts> {
  const errors: string[] = [];
  let upserted = 0;
  const runDelivery =
    kind === "marketman_orders_both" || kind === "marketman_orders_delivery";
  const runSent =
    kind === "marketman_orders_both" || kind === "marketman_orders_sent";

  if (runDelivery) {
    const r = await fetchAndUpsertMarketManOrdersForWindow(
      locationId,
      buyerGuid,
      "delivery",
      dateTimeFromUTC,
      dateTimeToUTC,
      () =>
        getOrdersByDeliveryDate(buyerGuid, dateTimeFromUTC, dateTimeToUTC),
    );
    upserted += r.upserted;
    if (r.error) errors.push(r.error);
  }
  if (runSent) {
    const r = await fetchAndUpsertMarketManOrdersForWindow(
      locationId,
      buyerGuid,
      "sent",
      dateTimeFromUTC,
      dateTimeToUTC,
      () => getOrdersBySentDate(buyerGuid, dateTimeFromUTC, dateTimeToUTC),
    );
    upserted += r.upserted;
    if (r.error) errors.push(r.error);
  }
  return { upserted, errors };
}

interface LocationSyncDoc {
  _id: unknown;
  timezone?: string | null;
  marketManBuyerGuid?: string | null;
}

type SyncOptionDates = { startDate?: string; endDate?: string };

type LocationSyncKindHandler = (
  locationId: string,
  doc: LocationSyncDoc,
  options?: SyncOptionDates,
) => Promise<SyncCounts>;

async function syncCountsSquarePaymentsRange(
  locationId: string,
  options?: SyncOptionDates,
): Promise<SyncCounts> {
  if (!options?.startDate || !options?.endDate) {
    return { upserted: 0, errors: ["startDate and endDate required"] };
  }
  return syncSquarePaymentsForLocation(
    locationId,
    new Date(options.startDate),
    new Date(options.endDate),
  );
}

async function syncCountsSquareOrdersRange(
  locationId: string,
  options?: SyncOptionDates,
): Promise<SyncCounts> {
  if (!options?.startDate || !options?.endDate) {
    return { upserted: 0, errors: ["startDate and endDate required"] };
  }
  return syncSquareOrdersForLocation(locationId, {
    startAt: new Date(options.startDate).toISOString(),
    endAt: new Date(options.endDate).toISOString(),
  });
}

async function syncCountsHomebaseTimecardsWindow(
  locationId: string,
  options?: SyncOptionDates,
): Promise<SyncCounts> {
  const win =
    options?.startDate && options?.endDate
      ? {
          startAt: new Date(options.startDate).toISOString(),
          endAt: new Date(options.endDate).toISOString(),
        }
      : homebaseSlidingWindowIso();
  return syncHomebaseTimecardsForLocation(
    locationId,
    win.startAt,
    win.endAt,
  );
}

async function syncMarketManOrdersPartialTodaySingleKind(
  locationId: string,
  timezone: string,
  buyerGuid: string,
  apiKind: "delivery" | "sent",
): Promise<SyncCounts> {
  const { ranges } = getOrderTrackerRanges("today", timezone);
  let upserted = 0;
  const errors: string[] = [];
  for (const r of ranges) {
    const fetchOrders =
      apiKind === "delivery"
        ? () =>
            getOrdersByDeliveryDate(
              buyerGuid,
              r.dateTimeFromUTC,
              r.dateTimeToUTC,
            )
        : () =>
            getOrdersBySentDate(
              buyerGuid,
              r.dateTimeFromUTC,
              r.dateTimeToUTC,
            );
    const batch = await fetchAndUpsertMarketManOrdersForWindow(
      locationId,
      buyerGuid,
      apiKind,
      r.dateTimeFromUTC,
      r.dateTimeToUTC,
      fetchOrders,
    );
    upserted += batch.upserted;
    if (batch.error) {
      errors.push(batch.error.replace(/^[^:]+:\s*/, ""));
    }
  }
  return { upserted, errors };
}

async function syncCountsMarketManOrdersForKind(
  locationId: string,
  doc: LocationSyncDoc,
  options: SyncOptionDates | undefined,
  kind:
    | "marketman_orders_both"
    | "marketman_orders_sent"
    | "marketman_orders_delivery",
): Promise<SyncCounts> {
  const tz = doc.timezone ?? "America/Denver";
  const bg = doc.marketManBuyerGuid?.trim();
  if (!bg) {
    return { upserted: 0, errors: ["No buyer GUID"] };
  }
  if (options?.startDate && options?.endDate) {
    const dateTimeFromUTC = formatMarketManDateUtc(new Date(options.startDate));
    const dateTimeToUTC = formatMarketManDateUtc(new Date(options.endDate));
    return syncMarketManOrdersInUtcRangeForLocation(
      locationId,
      bg,
      kind,
      dateTimeFromUTC,
      dateTimeToUTC,
    );
  }
  if (kind === "marketman_orders_both") {
    return syncMarketManOrdersTodayForLocation(locationId, tz, bg);
  }
  return syncMarketManOrdersPartialTodaySingleKind(
    locationId,
    tz,
    bg,
    kind === "marketman_orders_delivery" ? "delivery" : "sent",
  );
}

const SYNC_LOCATION_HANDLERS: Record<string, LocationSyncKindHandler> = {
  square_payments: (id, _doc, opts) =>
    syncCountsSquarePaymentsRange(id, opts),
  square_orders: (id, _doc, opts) => syncCountsSquareOrdersRange(id, opts),
  square_catalog: (id) => syncSquareCatalogForLocation(id),
  square_team_members: (id) => syncSquareTeamMembersForLocation(id),
  homebase_timecards: (id, _doc, opts) =>
    syncCountsHomebaseTimecardsWindow(id, opts),
  marketman_valid_count_dates: (id) =>
    syncMarketManValidCountDatesForLocation(id),
  marketman_orders_both: (id, doc, opts) =>
    syncCountsMarketManOrdersForKind(id, doc, opts, "marketman_orders_both"),
  marketman_orders_sent: (id, doc, opts) =>
    syncCountsMarketManOrdersForKind(id, doc, opts, "marketman_orders_sent"),
  marketman_orders_delivery: (id, doc, opts) =>
    syncCountsMarketManOrdersForKind(
      id,
      doc,
      opts,
      "marketman_orders_delivery",
    ),
};

export async function runSyncForAllLocations(
  kind: string,
  options?: { startDate?: string; endDate?: string; locationIds?: string[] },
): Promise<{ totalUpserted: number; byLocation: Record<string, SyncCounts> }> {
  let docs = await locationRepository.findAll();
  if (options?.locationIds?.length) {
    const allow = new Set(options.locationIds.map(String));
    docs = docs.filter((d) => allow.has(String(d._id)));
  }
  const byLocation: Record<string, SyncCounts> = {};
  let totalUpserted = 0;

  const handler = SYNC_LOCATION_HANDLERS[kind];

  for (const doc of docs) {
    const id = String(doc._id);
    try {
      const c = handler
        ? await handler(id, doc as LocationSyncDoc, options)
        : { upserted: 0, errors: [`Unknown kind ${kind}`] };
      byLocation[id] = c;
      totalUpserted += c.upserted;
    } catch (e) {
      logger.error("integration sync location failed", {
        locationId: id,
        kind,
        e,
      });
      byLocation[id] = {
        upserted: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      };
    }
  }

  return { totalUpserted, byLocation };
}

const ALL_TODAY_SYNC_ORDER: readonly IntegrationSyncResource[] = [
  "square_payments",
  "square_orders",
  "square_catalog",
  "square_team_members",
  "homebase_timecards",
  "marketman_valid_count_dates",
  "marketman_orders_both",
  "marketman_orders_sent",
  "marketman_orders_delivery",
];

function syncCountsStepOk(by: Record<string, SyncCounts>): boolean {
  return !Object.values(by).some((c) => c.errors.length > 0);
}

async function runSquarePaymentsLocalTodayAllLocations(): Promise<{
  totalUpserted: number;
  byLocation: Record<string, SyncCounts>;
}> {
  const docs = await locationRepository.findAll();
  const byLocation: Record<string, SyncCounts> = {};
  let totalUpserted = 0;
  for (const doc of docs) {
    const id = String(doc._id);
    try {
      const tz = doc.timezone?.trim() || "America/Denver";
      const { start, end } = getZonedCalendarDayUtcBounds(tz);
      const c = await syncSquarePaymentsForLocation(id, start, end);
      byLocation[id] = c;
      totalUpserted += c.upserted;
    } catch (e) {
      logger.error("runSquarePaymentsLocalTodayAllLocations failed", {
        locationId: id,
        e,
      });
      byLocation[id] = {
        upserted: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      };
    }
  }
  return { totalUpserted, byLocation };
}

async function runSquareOrdersLocalTodayAllLocations(): Promise<{
  totalUpserted: number;
  byLocation: Record<string, SyncCounts>;
}> {
  const docs = await locationRepository.findAll();
  const byLocation: Record<string, SyncCounts> = {};
  let totalUpserted = 0;
  for (const doc of docs) {
    const id = String(doc._id);
    try {
      const tz = doc.timezone?.trim() || "America/Denver";
      const { start, end } = getZonedCalendarDayUtcBounds(tz);
      const c = await syncSquareOrdersForLocation(id, {
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      });
      byLocation[id] = c;
      totalUpserted += c.upserted;
    } catch (e) {
      logger.error("runSquareOrdersLocalTodayAllLocations failed", {
        locationId: id,
        e,
      });
      byLocation[id] = {
        upserted: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      };
    }
  }
  return { totalUpserted, byLocation };
}

async function runHomebaseTimecardsLocalTodayAllLocations(): Promise<{
  totalUpserted: number;
  byLocation: Record<string, SyncCounts>;
}> {
  const docs = await locationRepository.findAll();
  const byLocation: Record<string, SyncCounts> = {};
  let totalUpserted = 0;
  for (const doc of docs) {
    const id = String(doc._id);
    try {
      const tz = doc.timezone?.trim() || "America/Denver";
      const { start, end } = getZonedCalendarDayUtcBounds(tz);
      const c = await syncHomebaseTimecardsForLocation(
        id,
        start.toISOString(),
        end.toISOString(),
      );
      byLocation[id] = c;
      totalUpserted += c.upserted;
    } catch (e) {
      logger.error("runHomebaseTimecardsLocalTodayAllLocations failed", {
        locationId: id,
        e,
      });
      byLocation[id] = {
        upserted: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      };
    }
  }
  return { totalUpserted, byLocation };
}

export interface AllTodaySyncStepResult {
  resource: IntegrationSyncResource;
  totalUpserted: number;
  byLocation: Record<string, SyncCounts>;
  ok: boolean;
}

/**
 * Runs every manual integration sync resource, all locations: date-bound syncs use each
 * location's calendar "today" in that location's timezone; MarketMan order syncs use
 * existing "today" behavior (no explicit date range). Order matches the Data Sync UI.
 */
export async function runSyncAllResourcesForToday(): Promise<{
  steps: AllTodaySyncStepResult[];
  totalUpserted: number;
  allOk: boolean;
}> {
  const steps: AllTodaySyncStepResult[] = [];
  let totalUpserted = 0;

  for (const resource of ALL_TODAY_SYNC_ORDER) {
    let total = 0;
    let byLocation: Record<string, SyncCounts> = {};

    if (resource === "square_payments") {
      const r = await runSquarePaymentsLocalTodayAllLocations();
      total = r.totalUpserted;
      byLocation = r.byLocation;
    } else if (resource === "square_orders") {
      const r = await runSquareOrdersLocalTodayAllLocations();
      total = r.totalUpserted;
      byLocation = r.byLocation;
    } else if (resource === "homebase_timecards") {
      const r = await runHomebaseTimecardsLocalTodayAllLocations();
      total = r.totalUpserted;
      byLocation = r.byLocation;
    } else {
      const r = await runSyncForAllLocations(resource, {});
      total = r.totalUpserted;
      byLocation = r.byLocation;
    }

    totalUpserted += total;
    const ok = syncCountsStepOk(byLocation);
    steps.push({ resource, totalUpserted: total, byLocation, ok });
  }

  const allOk = steps.every((s) => s.ok);
  return { steps, totalUpserted, allOk };
}

export async function resolveLocationIdForSquare(
  merchantId?: string,
  squareLocationId?: string,
): Promise<string | null> {
  if (squareLocationId?.trim()) {
    const loc =
      await locationRepository.findBySquareLocationId(squareLocationId);
    if (loc) return String(loc._id);
  }
  if (merchantId?.trim()) {
    const loc = await locationRepository.findBySquareMerchantId(merchantId);
    if (loc) return String(loc._id);
  }
  return null;
}

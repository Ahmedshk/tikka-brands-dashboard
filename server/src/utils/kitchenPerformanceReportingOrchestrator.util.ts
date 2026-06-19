import { loadSquareReportingQuery } from "../services/squareReporting.service.js";
import type {
  KitchenPerformanceDetailsResult,
  KitchenPerformanceRowDto,
} from "../types/kitchenPerformance.types.js";
import {
  buildItemSalesModifiersQuery,
  buildKdsHourlyQuery,
  buildKdsItemPerformanceQuery,
  buildKdsLineItemsPerTicketQuery,
  buildKdsStationSummaryQuery,
  buildKdsTicketRowsQuery,
} from "./kitchenPerformanceReportingQueries.util.js";
import {
  buildKitchenPerformanceDetailsForDevice,
  mapKdsStationSummaryRows,
  serializeItemSalesModifierLookup,
} from "./kitchenPerformanceReportingMapper.util.js";
import { buildItemSalesModifierLookup } from "./kitchenPerformanceTicketLineItems.util.js";
import {
  buildKitchenPerformanceDetailsCacheKey as buildDetailsResultCacheKey,
  buildKitchenPerformanceListCacheKey,
  buildKitchenPerformanceModifiersCacheKey,
  loadKitchenPerformanceDetailsCached,
  loadKitchenPerformanceListCached,
  loadKitchenPerformanceModifiersCached,
} from "./kitchenPerformanceSquareCache.util.js";

export interface KitchenPerformanceLocationReportInput {
  mongoLocationId: string;
  squareLocationId: string;
  accessToken: string;
  startDate: string;
  endDate: string;
  locationName: string;
  timezone: string;
}

export interface KitchenPerformanceDeviceDetailsInput
  extends KitchenPerformanceLocationReportInput {
  deviceName: string;
}

export interface KitchenPerformanceTicketModifiersInput {
  mongoLocationId: string;
  squareLocationId: string;
  accessToken: string;
  startDate: string;
  endDate: string;
  orderIds: string[];
}

const DEFAULT_LOCATION_CONCURRENCY = 4;

function resolveLocationConcurrency(): number {
  const raw = process.env.KITCHEN_PERFORMANCE_LOCATION_CONCURRENCY;
  if (!raw) return DEFAULT_LOCATION_CONCURRENCY;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_LOCATION_CONCURRENCY;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function runKitchenPerformanceListForLocation(
  input: KitchenPerformanceLocationReportInput,
): Promise<KitchenPerformanceRowDto[]> {
  const {
    mongoLocationId,
    squareLocationId,
    accessToken,
    startDate,
    endDate,
    locationName,
  } = input;

  const cacheKey = buildKitchenPerformanceListCacheKey(
    mongoLocationId,
    startDate,
    endDate,
  );

  return loadKitchenPerformanceListCached(cacheKey, async () => {
    const stationResult = await loadSquareReportingQuery(
      accessToken,
      buildKdsStationSummaryQuery(squareLocationId, startDate, endDate),
      { queryName: "kds.stationSummary" },
    );

    return mapKdsStationSummaryRows(
      stationResult.data,
      mongoLocationId,
      locationName,
    );
  });
}

export async function runKitchenPerformanceDetailsForDevice(
  input: KitchenPerformanceDeviceDetailsInput,
): Promise<KitchenPerformanceDetailsResult> {
  const {
    mongoLocationId,
    squareLocationId,
    accessToken,
    startDate,
    endDate,
    timezone,
    deviceName,
  } = input;

  const cacheKey = buildDetailsResultCacheKey(
    mongoLocationId,
    startDate,
    endDate,
    deviceName,
  );

  return loadKitchenPerformanceDetailsCached(cacheKey, async () => {
    const queryJobs: Array<{ name: string; query: Record<string, unknown> }> = [
      {
        name: "kds.ticketRows",
        query: buildKdsTicketRowsQuery(
          squareLocationId,
          startDate,
          endDate,
          deviceName,
        ),
      },
      {
        name: "kds.hourly",
        query: buildKdsHourlyQuery(
          squareLocationId,
          startDate,
          endDate,
          deviceName,
        ),
      },
      {
        name: "kds.lineItemsPerTicket",
        query: buildKdsLineItemsPerTicketQuery(
          squareLocationId,
          startDate,
          endDate,
          deviceName,
        ),
      },
      {
        name: "kds.itemPerformance",
        query: buildKdsItemPerformanceQuery(
          squareLocationId,
          startDate,
          endDate,
          deviceName,
        ),
      },
    ];

    const results = await Promise.all(
      queryJobs.map((job) =>
        loadSquareReportingQuery(accessToken, job.query, { queryName: job.name }),
      ),
    );

    const ticketResult = results[0]!;
    const hourlyResult = results[1]!;
    const lineItemResult = results[2]!;
    const itemPerformanceResult = results[3]!;

    return buildKitchenPerformanceDetailsForDevice(
      deviceName,
      ticketResult.data,
      hourlyResult.data,
      lineItemResult.data,
      itemPerformanceResult.data,
      timezone,
    );
  });
}

export async function runKitchenPerformanceTicketModifiers(
  input: KitchenPerformanceTicketModifiersInput,
): Promise<Record<string, Record<string, string[]>>> {
  const {
    mongoLocationId,
    squareLocationId,
    accessToken,
    startDate,
    endDate,
    orderIds,
  } = input;

  const uniqueOrderIds = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueOrderIds.length === 0) {
    return {};
  }

  const cacheKey = buildKitchenPerformanceModifiersCacheKey(
    mongoLocationId,
    startDate,
    endDate,
    uniqueOrderIds,
  );

  return loadKitchenPerformanceModifiersCached(cacheKey, async () => {
    const itemSalesResult = await loadSquareReportingQuery(
      accessToken,
      buildItemSalesModifiersQuery(
        squareLocationId,
        startDate,
        endDate,
        uniqueOrderIds,
      ),
      { queryName: "itemSales.modifiers" },
    );

    return serializeItemSalesModifierLookup(
      buildItemSalesModifierLookup(itemSalesResult.data),
    );
  });
}

export async function runKitchenPerformanceReportingForLocations(
  locations: KitchenPerformanceLocationReportInput[],
): Promise<KitchenPerformanceRowDto[]> {
  const partials = await mapWithConcurrency(
    locations,
    resolveLocationConcurrency(),
    (location) => runKitchenPerformanceListForLocation(location),
  );

  const listRows = partials.flat();
  listRows.sort(
    (a, b) =>
      a.location.localeCompare(b.location) ||
      a.deviceName.localeCompare(b.deviceName),
  );

  return listRows;
}

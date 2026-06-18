import { loadSquareReportingQuery } from "../services/squareReporting.service.js";
import type {
  KitchenPerformanceDetailsResult,
  KitchenPerformanceRowDto,
} from "../types/kitchenPerformance.types.js";
import {
  buildItemSalesModifiersQuery,
  buildKdsDeviceKpisQuery,
  buildKdsHourlyQuery,
  buildKdsItemPerformanceQuery,
  buildKdsLineItemsPerTicketQuery,
  buildKdsStationSummaryQuery,
  buildKdsTicketRowsQuery,
} from "./kitchenPerformanceReportingQueries.util.js";
import {
  applyDedupedTicketCountsToStationSummaryRows,
  applyFlooredAvgCompletionToStationSummaryRows,
  buildKitchenPerformanceDetailsByDevice,
  mapKdsStationSummaryRows,
} from "./kitchenPerformanceReportingMapper.util.js";

export interface KitchenPerformanceLocationReportInput {
  mongoLocationId: string;
  squareLocationId: string;
  accessToken: string;
  startDate: string;
  endDate: string;
  locationName: string;
  timezone: string;
}

export interface KitchenPerformanceLocationReportResult {
  listRows: KitchenPerformanceRowDto[];
  detailsByKey: Record<string, KitchenPerformanceDetailsResult>;
}

export async function runKitchenPerformanceReportingForLocation(
  input: KitchenPerformanceLocationReportInput,
): Promise<KitchenPerformanceLocationReportResult> {
  const {
    mongoLocationId,
    squareLocationId,
    accessToken,
    startDate,
    endDate,
    locationName,
    timezone,
  } = input;

  const queryJobs: Array<{ name: string; query: Record<string, unknown> }> = [
    {
      name: "kds.stationSummary",
      query: buildKdsStationSummaryQuery(squareLocationId, startDate, endDate),
    },
    {
      name: "kds.ticketRows",
      query: buildKdsTicketRowsQuery(squareLocationId, startDate, endDate),
    },
    {
      name: "kds.hourly",
      query: buildKdsHourlyQuery(squareLocationId, startDate, endDate),
    },
    {
      name: "kds.lineItemsPerTicket",
      query: buildKdsLineItemsPerTicketQuery(
        squareLocationId,
        startDate,
        endDate,
      ),
    },
    {
      name: "kds.itemPerformance",
      query: buildKdsItemPerformanceQuery(squareLocationId, startDate, endDate),
    },
    {
      name: "kds.deviceKpis",
      query: buildKdsDeviceKpisQuery(squareLocationId, startDate, endDate),
    },
    {
      name: "itemSales.modifiers",
      query: buildItemSalesModifiersQuery(squareLocationId, startDate, endDate),
    },
  ];

  const results = await Promise.all(
    queryJobs.map((job) =>
      loadSquareReportingQuery(accessToken, job.query, { queryName: job.name }),
    ),
  );

  const stationResult = results[0]!;
  const ticketResult = results[1]!;
  const hourlyResult = results[2]!;
  const lineItemResult = results[3]!;
  const itemPerformanceResult = results[4]!;
  const deviceKpiResult = results[5]!;
  const itemSalesResult = results[6]!;

  const listRows = mapKdsStationSummaryRows(
    stationResult.data,
    mongoLocationId,
    locationName,
  );

  const detailsByKey = buildKitchenPerformanceDetailsByDevice(
    listRows,
    ticketResult.data,
    hourlyResult.data,
    lineItemResult.data,
    itemPerformanceResult.data,
    deviceKpiResult.data,
    itemSalesResult.data,
    mongoLocationId,
    timezone,
  );

  applyFlooredAvgCompletionToStationSummaryRows(
    listRows,
    ticketResult.data,
    mongoLocationId,
  );
  applyDedupedTicketCountsToStationSummaryRows(
    listRows,
    ticketResult.data,
    mongoLocationId,
  );

  return { listRows, detailsByKey };
}

const LOCATION_CONCURRENCY = 2;

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

export async function runKitchenPerformanceReportingForLocations(
  locations: KitchenPerformanceLocationReportInput[],
): Promise<KitchenPerformanceLocationReportResult> {
  const partials = await mapWithConcurrency(
    locations,
    LOCATION_CONCURRENCY,
    (location) => runKitchenPerformanceReportingForLocation(location),
  );

  const listRows = partials.flatMap((p) => p.listRows);
  const detailsByKey: Record<string, KitchenPerformanceDetailsResult> = {};
  for (const partial of partials) {
    Object.assign(detailsByKey, partial.detailsByKey);
  }

  listRows.sort(
    (a, b) =>
      a.location.localeCompare(b.location) ||
      a.deviceName.localeCompare(b.deviceName),
  );

  return { listRows, detailsByKey };
}

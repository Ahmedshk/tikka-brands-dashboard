import { formatInTimeZone } from "date-fns-tz";
import { LocationService } from "./location.service.js";
import { ValidationError } from "../utils/errors.util.js";
import { KitchenPerformanceRepository } from "../repositories/kitchenPerformance.repository.js";
import { getCalendarYmdInTz } from "../utils/timezone.util.js";
import {
  parseKitchenPerformanceTimestamp,
  sortKitchenPerformanceTicketsByTimeCreatedAsc,
} from "../utils/kitchenPerformanceTimestamp.util.js";
import { computeKitchenPerformanceLateKpis } from "../utils/kitchenPerformanceLateKpis.util.js";
import {
  normalizeKitchenPerformanceTimeDue,
} from "../utils/kitchenPerformanceTimeDue.util.js";
import { mapKitchenPerformanceStationType } from "../utils/kitchenPerformanceStationType.util.js";
import type {
  KitchenPerformanceDetailsResult,
  KitchenPerformanceHourlyPointDto,
  KitchenPerformanceItemPerformanceRowDto,
  KitchenPerformanceListResult,
  KitchenPerformanceRawTicketInput,
  KitchenPerformanceReportResult,
  KitchenPerformanceRowDto,
  KitchenPerformanceRowInput,
  KitchenPerformanceTicketKpisDto,
  KitchenPerformanceTicketRowDto,
} from "../types/kitchenPerformance.types.js";
import { runKitchenPerformanceReportingForLocations } from "../utils/kitchenPerformanceReportingOrchestrator.util.js";

const REQUIRED_HEADERS = [
  "Device Name",
  "Ticket Name",
  "Order Source",
  "Number of Items",
  "Items in Ticket",
  "Completion Time (seconds)",
  "Time Created",
  "Time Completed",
  "Time Due",
  "Time Recalled",
] as const;

type CsvRecord = Record<string, string>;

interface GroupAccumulator {
  deviceName: string;
  completedTickets: number;
  ticketsWithCompletionTime: number;
  totalCompletionTimeSeconds: number;
}

interface ItemAccumulator {
  totalQuantity: number;
  completionTimes: number[];
}

interface KitchenPerformanceLeanDoc {
  reportDate?: string;
  rows?: Array<{
    deviceName: string;
    type?: string;
    completedTickets: number;
    avgCompletionTimeSeconds: number;
  }>;
  rawTickets?: KitchenPerformanceRawTicketInput[] | null;
}

function normalizeLineBreaks(input: string): string {
  return input.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let i = 0;
  let inQuotes = false;

  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i += 1;
      continue;
    }
    if (ch === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"(.*)"$/s, "$1").trim());
}

function asNullableString(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized === "" ? null : normalized;
}

function asNullableNumber(value: string | undefined): number | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Parse CSV datetime strings for the store location.
 * Naive values (no `Z` / offset) are **wall time in `timezone`** (e.g. "2026-04-05 16:37:52").
 * Values with `Z` or a numeric offset are parsed as absolute instants.
 */
function parseCsvTimestampInLocation(value: string | null, timezone: string): Date | null {
  return parseKitchenPerformanceTimestamp(value, timezone);
}

function formatYmdFromCalendarParts(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function reportDateFromTimeCreated(timeCreated: string | null, timezone: string): string | null {
  const instant = parseCsvTimestampInLocation(timeCreated, timezone);
  if (!instant) return null;
  const { y, m, d } = getCalendarYmdInTz(instant.getTime(), timezone);
  return formatYmdFromCalendarParts(y, m, d);
}

function formatHourLabel(hour24: number): string {
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12} ${suffix}`;
}

function parseItemsInTicket(itemsInTicket: string | null): Array<{ itemName: string; quantity: number }> {
  if (!itemsInTicket) return [];
  return itemsInTicket
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const match = /^(\d+)\s*x\s*(.+)$/i.exec(chunk);
      if (!match) {
        return { itemName: chunk, quantity: 1 };
      }
      const [, quantityRaw, itemNameRaw] = match;
      const quantity = Number.parseInt(quantityRaw ?? "1", 10);
      return {
        itemName: itemNameRaw?.trim() ?? chunk,
        quantity: Number.isNaN(quantity) || quantity < 1 ? 1 : quantity,
      };
    })
    .filter((x) => x.itemName.length > 0);
}

function parseCsv(content: string): CsvRecord[] {
  const normalized = normalizeLineBreaks(content).trim();
  if (!normalized) return [];

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headerValues = parseCsvLine(lines[0] ?? "");
  for (const requiredHeader of REQUIRED_HEADERS) {
    if (!headerValues.includes(requiredHeader)) {
      throw new ValidationError(
        `CSV is missing required header "${requiredHeader}".`,
      );
    }
  }

  const records: CsvRecord[] = [];
  for (let idx = 1; idx < lines.length; idx += 1) {
    const row = parseCsvLine(lines[idx] ?? "");
    if (row.length === 1 && row[0] === "") continue;
    const record: CsvRecord = {};
    headerValues.forEach((header, headerIndex) => {
      record[header] = row[headerIndex] ?? "";
    });
    records.push(record);
  }
  return records;
}

function mapRawTickets(records: CsvRecord[]): KitchenPerformanceRawTicketInput[] {
  return records.map((record) => ({
    deviceName: asNullableString(record["Device Name"]),
    ticketName: asNullableString(record["Ticket Name"]),
    orderSource: asNullableString(record["Order Source"]),
    numberOfItems: asNullableNumber(record["Number of Items"]),
    itemsInTicket: asNullableString(record["Items in Ticket"]),
    completionTimeSeconds: asNullableNumber(record["Completion Time (seconds)"]),
    timeCreated: asNullableString(record["Time Created"]),
    timeCompleted: asNullableString(record["Time Completed"]),
    timeDue: asNullableString(record["Time Due"]),
    timeRecalled: asNullableString(record["Time Recalled"]),
  }));
}

function aggregateRowsFromRawTickets(
  tickets: KitchenPerformanceRawTicketInput[],
): KitchenPerformanceRowInput[] {
  const grouped = new Map<string, GroupAccumulator>();

  for (const ticket of tickets) {
    const deviceName = ticket.deviceName?.trim() ?? "";
    if (!deviceName) {
      continue;
    }
    const completionTimeSeconds = ticket.completionTimeSeconds;

    const key = deviceName;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        deviceName,
        completedTickets: 1,
        ticketsWithCompletionTime: completionTimeSeconds == null ? 0 : 1,
        totalCompletionTimeSeconds: completionTimeSeconds ?? 0,
      });
      continue;
    }
    existing.completedTickets += 1;
    if (completionTimeSeconds != null) {
      existing.ticketsWithCompletionTime += 1;
      existing.totalCompletionTimeSeconds += completionTimeSeconds;
    }
  }

  return Array.from(grouped.values())
    .map((item) => ({
      deviceName: item.deviceName,
      type: "Unknown",
      completedTickets: item.completedTickets,
      avgCompletionTimeSeconds:
        item.ticketsWithCompletionTime > 0
          ? Math.round(
              item.totalCompletionTimeSeconds / item.ticketsWithCompletionTime,
            )
          : 0,
    }))
    .sort((a, b) => a.deviceName.localeCompare(b.deviceName));
}

function aggregateRowsFromStoredRowSubdocuments(
  datasets: KitchenPerformanceLeanDoc[],
): KitchenPerformanceRowInput[] {
  const grouped = new Map<
    string,
    {
      deviceName: string;
      type: string;
      completedTickets: number;
      weightedTimeSum: number;
    }
  >();

  for (const doc of datasets) {
    for (const row of doc.rows ?? []) {
      const key = row.deviceName?.trim() ?? "";
      if (!key) continue;
      const existing = grouped.get(key) ?? {
        deviceName: key,
        type: row.type?.trim() || "Unknown",
        completedTickets: 0,
        weightedTimeSum: 0,
      };
      if (existing.type === "Unknown" && row.type?.trim()) {
        existing.type = row.type.trim();
      }
      const n = row.completedTickets ?? 0;
      existing.completedTickets += n;
      existing.weightedTimeSum += row.avgCompletionTimeSeconds * n;
      grouped.set(key, existing);
    }
  }

  return Array.from(grouped.values())
    .map((item) => ({
      deviceName: item.deviceName,
      type: item.type,
      completedTickets: item.completedTickets,
      avgCompletionTimeSeconds:
        item.completedTickets > 0
          ? Math.round(item.weightedTimeSum / item.completedTickets)
          : 0,
    }))
    .sort((a, b) => a.deviceName.localeCompare(b.deviceName));
}

function paginateRows(
  rows: KitchenPerformanceRowDto[],
  page: number,
  limit: number,
): KitchenPerformanceListResult {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * limit;
  const items = rows.slice(startIndex, startIndex + limit);

  return {
    items,
    meta: {
      total,
      page: safePage,
      limit,
      totalPages,
    },
  };
}

function computeTicketKpisAndRows(
  tickets: KitchenPerformanceRawTicketInput[],
  timezone: string,
): { kpis: KitchenPerformanceTicketKpisDto; ticketRows: KitchenPerformanceTicketRowDto[] } {
  const ticketRows: KitchenPerformanceTicketRowDto[] = tickets.map((ticket) => ({
    ticketName: ticket.ticketName,
    orderSource: ticket.orderSource,
    numberOfItems: ticket.numberOfItems,
    itemsInTicket: ticket.itemsInTicket,
    ticketLineItems: null,
    timeCreated: ticket.timeCreated,
    timeCompleted: ticket.timeCompleted,
    timeDue: normalizeKitchenPerformanceTimeDue(
      ticket.timeDue,
      ticket.timeCreated,
      ticket.timeDue,
      ticket.timeCreated,
    ),
    timeRecalled: ticket.timeRecalled,
    completionTimeSeconds: ticket.completionTimeSeconds,
    isLate: null,
  }));

  const completionTimes = tickets
    .map((ticket) => ticket.completionTimeSeconds)
    .filter((value): value is number => value != null);
  const completedTickets = completionTimes.length;

  const completedItems = tickets.reduce((sum, ticket) => {
    if (ticket.numberOfItems != null) return sum + ticket.numberOfItems;
    const parsedQuantity = parseItemsInTicket(ticket.itemsInTicket).reduce(
      (acc, item) => acc + item.quantity,
      0,
    );
    return sum + parsedQuantity;
  }, 0);

  const recalledTickets = tickets.filter((ticket) => ticket.timeRecalled != null).length;

  const lateKpiRows = ticketRows.map((ticket) => ({
    isLate:
      ticket.isLate ??
      (() => {
        const completed = parseCsvTimestampInLocation(ticket.timeCompleted, timezone);
        const due = parseCsvTimestampInLocation(ticket.timeDue, timezone);
        if (!due || !completed) return null;
        return completed.getTime() > due.getTime();
      })(),
    timeDue: ticket.timeDue,
  }));

  const lateKpis = computeKitchenPerformanceLateKpis(lateKpiRows, completedTickets);

  return {
    kpis: {
      completedTickets,
      completedItems,
      avgCompletionTimeSeconds:
        completedTickets > 0
          ? Math.round(completionTimes.reduce((acc, value) => acc + value, 0) / completedTickets)
          : null,
      recalledTickets,
      avgItemsPerTicket:
        completedTickets > 0
          ? Number((completedItems / completedTickets).toFixed(2))
          : null,
      ticketsPastDueTime: lateKpis.ticketsPastDueTime,
      ticketsWithTimeDue: lateKpis.ticketsWithTimeDue,
      ticketsLatePercent: lateKpis.ticketsLatePercent,
    },
    ticketRows: sortKitchenPerformanceTicketsByTimeCreatedAsc(ticketRows, timezone),
  };
}

function computeHourlyCompletedTickets(
  tickets: KitchenPerformanceRawTicketInput[],
  timezone: string,
): KitchenPerformanceHourlyPointDto[] {
  const tz = timezone.trim();
  const counts = new Array<number>(24).fill(0);
  for (const ticket of tickets) {
    const completed = parseCsvTimestampInLocation(ticket.timeCompleted, tz);
    if (!completed) continue;
    const hourStr = formatInTimeZone(completed, tz, "H");
    const hour = Number.parseInt(hourStr, 10);
    if (Number.isNaN(hour) || hour < 0 || hour > 23) continue;
    counts[hour] = (counts[hour] ?? 0) + 1;
  }
  return counts.map((completedTickets, hour24) => ({
    hour24,
    label: formatHourLabel(hour24),
    completedTickets,
  }));
}

function computeItemPerformance(
  tickets: KitchenPerformanceRawTicketInput[],
): KitchenPerformanceItemPerformanceRowDto[] {
  const byItem = new Map<string, ItemAccumulator>();

  for (const ticket of tickets) {
    const parsedItems = parseItemsInTicket(ticket.itemsInTicket);
    if (parsedItems.length === 0) continue;
    const completion = ticket.completionTimeSeconds;
    for (const parsedItem of parsedItems) {
      const key = parsedItem.itemName;
      const existing = byItem.get(key) ?? { totalQuantity: 0, completionTimes: [] };
      existing.totalQuantity += parsedItem.quantity;
      if (completion != null) {
        existing.completionTimes.push(completion);
      }
      byItem.set(key, existing);
    }
  }

  return Array.from(byItem.entries())
    .map(([itemName, aggregate]) => {
      const times = aggregate.completionTimes;
      const minCompletionTimeSeconds =
        times.length > 0 ? Math.min(...times) : null;
      const maxCompletionTimeSeconds =
        times.length > 0 ? Math.max(...times) : null;
      const avgCompletionTimeSeconds =
        times.length > 0
          ? Math.round(times.reduce((acc, value) => acc + value, 0) / times.length)
          : null;
      return {
        itemName,
        avgCompletionTimeSeconds,
        minCompletionTimeSeconds,
        maxCompletionTimeSeconds,
        totalQuantity: aggregate.totalQuantity,
      };
    })
    .sort((a, b) => {
      if (b.totalQuantity !== a.totalQuantity) {
        return b.totalQuantity - a.totalQuantity;
      }
      return a.itemName.localeCompare(b.itemName);
    });
}

function mergeRawTicketsFromDatasets(
  datasets: KitchenPerformanceLeanDoc[],
): KitchenPerformanceRawTicketInput[] {
  const out: KitchenPerformanceRawTicketInput[] = [];
  for (const doc of datasets) {
    const chunk = doc.rawTickets ?? [];
    out.push(...chunk);
  }
  return out;
}

export class KitchenPerformanceService {
  private readonly repository: KitchenPerformanceRepository;
  private readonly locationService: LocationService;

  constructor() {
    this.repository = new KitchenPerformanceRepository();
    this.locationService = new LocationService();
  }

  async importCsv(
    actorUserId: string,
    locationId: string,
    startDate: string,
    endDate: string,
    fileBuffer: Buffer,
  ): Promise<{ importedRows: number; daysUpdated: string[] }> {
    const location = await this.locationService.getById(locationId);
    const timezone = location?.timezone?.trim() ?? "UTC";

    const csvContent = fileBuffer.toString("utf-8");
    const parsedRecords = parseCsv(csvContent);
    const rawTickets = mapRawTickets(parsedRecords);
    if (rawTickets.length === 0) {
      throw new ValidationError("CSV contains no data rows.");
    }

    const byReportDate = new Map<string, KitchenPerformanceRawTicketInput[]>();
    const outsideDates = new Set<string>();

    for (const ticket of rawTickets) {
      const rd = reportDateFromTimeCreated(ticket.timeCreated, timezone);
      if (!rd) {
        throw new ValidationError(
          'Each row must have a valid "Time Created" value for import.',
        );
      }
      if (rd < startDate || rd > endDate) {
        outsideDates.add(rd);
        continue;
      }
      const list = byReportDate.get(rd) ?? [];
      list.push(ticket);
      byReportDate.set(rd, list);
    }

    if (outsideDates.size > 0) {
      const sorted = Array.from(outsideDates).sort((a, b) => a.localeCompare(b));
      throw new ValidationError(
        `CSV contains tickets whose local report date is outside the selected import period (${startDate}–${endDate}). Offending date(s): ${sorted.join(", ")}.`,
      );
    }

    if (byReportDate.size === 0) {
      throw new ValidationError(
        "No tickets fall within the selected import period after parsing Time Created.",
      );
    }

    const daysUpdated: string[] = [];
    for (const [reportDate, ticketsForDay] of Array.from(byReportDate.entries()).sort(
      (a, b) => a[0].localeCompare(b[0]),
    )) {
      const aggregatedRows = aggregateRowsFromRawTickets(ticketsForDay);
      if (aggregatedRows.length === 0) {
        throw new ValidationError(
          `CSV contains no valid rows for Device Name on report date ${reportDate}.`,
        );
      }
      await this.repository.upsertByLocationAndDate(
        locationId,
        reportDate,
        aggregatedRows,
        ticketsForDay,
        actorUserId,
      );
      daysUpdated.push(reportDate);
    }

    return { importedRows: rawTickets.length, daysUpdated };
  }

  async getByLocationAndDateRange(
    locationId: string,
    startDate: string,
    endDate: string,
    page: number,
    limit: number,
  ): Promise<KitchenPerformanceListResult> {
    const [datasets, location] = await Promise.all([
      this.repository.findByLocationAndDateRange(locationId, startDate, endDate),
      this.locationService.getById(locationId),
    ]);

    const locationName = location?.storeName ?? "Unknown Location";
    const mergedTickets = mergeRawTicketsFromDatasets(datasets as KitchenPerformanceLeanDoc[]);

    const sourceRows: KitchenPerformanceRowInput[] =
      mergedTickets.length > 0
        ? aggregateRowsFromRawTickets(mergedTickets)
        : aggregateRowsFromStoredRowSubdocuments(datasets as KitchenPerformanceLeanDoc[]);

    const rows: KitchenPerformanceRowDto[] = sourceRows
      .map((row) => ({
        deviceName: row.deviceName,
        type: mapKitchenPerformanceStationType(row.type),
        location: locationName,
        completedTickets: row.completedTickets,
        avgCompletionTimeSeconds: row.avgCompletionTimeSeconds,
      }))
      .sort((a, b) => a.deviceName.localeCompare(b.deviceName));
    return paginateRows(rows, page, limit);
  }

  async getDetailsByLocationDateRangeAndDevice(
    locationId: string,
    startDate: string,
    endDate: string,
    deviceName: string,
  ): Promise<KitchenPerformanceDetailsResult> {
    const [datasets, location] = await Promise.all([
      this.repository.findByLocationAndDateRange(locationId, startDate, endDate),
      this.locationService.getById(locationId),
    ]);

    const timezone = location?.timezone?.trim() ?? "UTC";
    const normalizedDevice = deviceName.trim().toLowerCase();
    const mergedTickets = mergeRawTicketsFromDatasets(datasets as KitchenPerformanceLeanDoc[]);
    const deviceTickets = mergedTickets.filter(
      (ticket) => (ticket.deviceName?.trim().toLowerCase() ?? "") === normalizedDevice,
    );

    const { kpis, ticketRows } = computeTicketKpisAndRows(deviceTickets, timezone);
    const hourlyCompletedTickets = computeHourlyCompletedTickets(deviceTickets, timezone);
    const itemPerformanceRows = computeItemPerformance(deviceTickets);

    return {
      kpis,
      hourlyCompletedTickets,
      ticketRows,
      itemPerformanceRows,
    };
  }

  async runReportFromSquare(
    locationIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<KitchenPerformanceReportResult> {
    if (locationIds.length === 0) {
      throw new ValidationError("At least one location is required.");
    }

    const locationInputs = await Promise.all(
      locationIds.map(async (locationId) => {
        const creds = await this.locationService.getByIdWithCredentials(locationId);
        if (!creds) {
          throw new ValidationError(`Location not found: ${locationId}`);
        }
        if (!creds.squareAccessToken?.trim()) {
          throw new ValidationError(
            `Square credentials are not configured for ${creds.location.storeName ?? "this location"}.`,
          );
        }
        const squareLocationId = creds.location.squareLocationId?.trim();
        if (!squareLocationId) {
          throw new ValidationError(
            `Square location ID is not configured for ${creds.location.storeName ?? "this location"}.`,
          );
        }
        return {
          mongoLocationId: locationId,
          squareLocationId,
          accessToken: creds.squareAccessToken,
          startDate,
          endDate,
          locationName: creds.location.storeName ?? "Unknown Location",
          timezone: creds.location.timezone?.trim() || "America/Denver",
        };
      }),
    );

    const { listRows, detailsByKey } =
      await runKitchenPerformanceReportingForLocations(locationInputs);

    return {
      listRows,
      detailsByKey,
      meta: {
        startDate,
        endDate,
        locationIds,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}

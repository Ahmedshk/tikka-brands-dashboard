import { LocationService } from "./location.service.js";
import { ValidationError } from "../utils/errors.util.js";
import { KitchenPerformanceRepository } from "../repositories/kitchenPerformance.repository.js";
import type {
  KitchenPerformanceDetailsResult,
  KitchenPerformanceHourlyPointDto,
  KitchenPerformanceItemPerformanceRowDto,
  KitchenPerformanceListResult,
  KitchenPerformanceRawTicketInput,
  KitchenPerformanceRowDto,
  KitchenPerformanceRowInput,
  KitchenPerformanceTicketKpisDto,
  KitchenPerformanceTicketRowDto,
} from "../types/kitchenPerformance.types.js";

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

function parseTimestamp(value: string | null): Date | null {
  if (!value) return null;
  const normalized = value.replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
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
): { kpis: KitchenPerformanceTicketKpisDto; ticketRows: KitchenPerformanceTicketRowDto[] } {
  const ticketRows: KitchenPerformanceTicketRowDto[] = tickets.map((ticket) => ({
    ticketName: ticket.ticketName,
    orderSource: ticket.orderSource,
    numberOfItems: ticket.numberOfItems,
    timeCreated: ticket.timeCreated,
    timeCompleted: ticket.timeCompleted,
    timeDue: ticket.timeDue,
    timeRecalled: ticket.timeRecalled,
    completionTimeSeconds: ticket.completionTimeSeconds,
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

  const ticketsPastDueTime = tickets.reduce((count, ticket) => {
    const completed = parseTimestamp(ticket.timeCompleted);
    const due = parseTimestamp(ticket.timeDue);
    if (!completed || !due) return count;
    return completed.getTime() > due.getTime() ? count + 1 : count;
  }, 0);

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
      ticketsPastDueTime,
    },
    ticketRows,
  };
}

function computeHourlyCompletedTickets(
  tickets: KitchenPerformanceRawTicketInput[],
): KitchenPerformanceHourlyPointDto[] {
  const counts = new Array<number>(24).fill(0);
  for (const ticket of tickets) {
    const completed = parseTimestamp(ticket.timeCompleted);
    if (!completed) continue;
    const hour = completed.getHours();
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
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
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
    reportDate: string,
    fileBuffer: Buffer,
  ): Promise<{ importedRows: number }> {
    const csvContent = fileBuffer.toString("utf-8");
    const parsedRecords = parseCsv(csvContent);
    const rawTickets = mapRawTickets(parsedRecords);
    const aggregatedRows = aggregateRowsFromRawTickets(rawTickets);
    if (rawTickets.length === 0 || aggregatedRows.length === 0) {
      throw new ValidationError(
        "CSV contains no valid rows for Device Name.",
      );
    }

    await this.repository.upsertByLocationAndDate(
      locationId,
      reportDate,
      aggregatedRows,
      rawTickets,
      actorUserId,
    );
    return { importedRows: rawTickets.length };
  }

  async getByLocationAndDate(
    locationId: string,
    reportDate: string,
    page: number,
    limit: number,
  ): Promise<KitchenPerformanceListResult> {
    const [dataset, location] = await Promise.all([
      this.repository.findByLocationAndDate(locationId, reportDate),
      this.locationService.getById(locationId),
    ]);

    const locationName = location?.storeName ?? "Unknown Location";
    const sourceTickets = (dataset?.rawTickets ?? []) as KitchenPerformanceRawTicketInput[];
    const sourceRows = sourceTickets.length > 0
      ? aggregateRowsFromRawTickets(sourceTickets)
      : ((dataset?.rows ?? []).map((row) => ({
          deviceName: row.deviceName,
          completedTickets: row.completedTickets,
          avgCompletionTimeSeconds: row.avgCompletionTimeSeconds,
        })) as KitchenPerformanceRowInput[]);
    const rows: KitchenPerformanceRowDto[] = sourceRows
      .map((row) => ({
        deviceName: row.deviceName,
        location: locationName,
        completedTickets: row.completedTickets,
        avgCompletionTimeSeconds: row.avgCompletionTimeSeconds,
      }))
      .sort((a, b) => a.deviceName.localeCompare(b.deviceName));
    return paginateRows(rows, page, limit);
  }

  async getDetailsByLocationDateAndDevice(
    locationId: string,
    reportDate: string,
    deviceName: string,
  ): Promise<KitchenPerformanceDetailsResult> {
    const dataset = await this.repository.findByLocationAndDate(locationId, reportDate);
    const normalizedDevice = deviceName.trim().toLowerCase();
    const allTickets = (dataset?.rawTickets ?? []) as KitchenPerformanceRawTicketInput[];
    const deviceTickets = allTickets.filter(
      (ticket) => (ticket.deviceName?.trim().toLowerCase() ?? "") === normalizedDevice,
    );

    const { kpis, ticketRows } = computeTicketKpisAndRows(deviceTickets);
    const hourlyCompletedTickets = computeHourlyCompletedTickets(deviceTickets);
    const itemPerformanceRows = computeItemPerformance(deviceTickets);

    return {
      kpis,
      hourlyCompletedTickets,
      ticketRows,
      itemPerformanceRows,
    };
  }
}

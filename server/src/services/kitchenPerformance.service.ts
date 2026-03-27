import { LocationService } from "./location.service.js";
import { ValidationError } from "../utils/errors.util.js";
import { KitchenPerformanceRepository } from "../repositories/kitchenPerformance.repository.js";
import type {
  KitchenPerformanceListResult,
  KitchenPerformanceRowDto,
  KitchenPerformanceRowInput,
} from "../types/kitchenPerformance.types.js";

const REQUIRED_HEADERS = [
  "Device Name",
  "Completion Time (seconds)",
] as const;

type CsvRecord = Record<string, string>;

interface GroupAccumulator {
  deviceName: string;
  completedTickets: number;
  totalCompletionTimeSeconds: number;
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

function aggregateRows(records: CsvRecord[]): KitchenPerformanceRowInput[] {
  const grouped = new Map<string, GroupAccumulator>();

  for (const record of records) {
    const deviceName = (record["Device Name"] ?? "").trim();
    const completionRaw = (record["Completion Time (seconds)"] ?? "").trim();
    const completionTimeSeconds = Number.parseFloat(completionRaw);

    if (!deviceName || Number.isNaN(completionTimeSeconds)) {
      continue;
    }

    const key = deviceName;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        deviceName,
        completedTickets: 1,
        totalCompletionTimeSeconds: completionTimeSeconds,
      });
      continue;
    }
    existing.completedTickets += 1;
    existing.totalCompletionTimeSeconds += completionTimeSeconds;
  }

  return Array.from(grouped.values())
    .map((item) => ({
      deviceName: item.deviceName,
      completedTickets: item.completedTickets,
      avgCompletionTimeSeconds:
        item.completedTickets > 0
          ? Math.round(item.totalCompletionTimeSeconds / item.completedTickets)
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
    const aggregatedRows = aggregateRows(parsedRecords);
    if (aggregatedRows.length === 0) {
      throw new ValidationError(
        "CSV contains no valid rows for Device Name and Completion Time (seconds).",
      );
    }

    await this.repository.upsertByLocationAndDate(
      locationId,
      reportDate,
      aggregatedRows,
      actorUserId,
    );
    return { importedRows: aggregatedRows.length };
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
    const groupedByDevice = new Map<
      string,
      { completedTickets: number; weightedCompletionSeconds: number }
    >();
    for (const row of dataset?.rows ?? []) {
      const key = row.deviceName.trim();
      if (!key) continue;
      const existing = groupedByDevice.get(key);
      const weightedSeconds = row.avgCompletionTimeSeconds * row.completedTickets;
      if (!existing) {
        groupedByDevice.set(key, {
          completedTickets: row.completedTickets,
          weightedCompletionSeconds: weightedSeconds,
        });
        continue;
      }
      existing.completedTickets += row.completedTickets;
      existing.weightedCompletionSeconds += weightedSeconds;
    }

    const rows: KitchenPerformanceRowDto[] = Array.from(groupedByDevice.entries())
      .map(([deviceName, aggregate]) => ({
        deviceName,
        location: locationName,
        completedTickets: aggregate.completedTickets,
        avgCompletionTimeSeconds:
          aggregate.completedTickets > 0
            ? Math.round(
                aggregate.weightedCompletionSeconds / aggregate.completedTickets,
              )
            : 0,
      }))
      .sort((a, b) => a.deviceName.localeCompare(b.deviceName));
    return paginateRows(rows, page, limit);
  }
}

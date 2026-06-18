import type {
  KitchenPerformanceDetailsResult,
  KitchenPerformanceHourlyPointDto,
  KitchenPerformanceItemPerformanceRowDto,
  KitchenPerformanceRowDto,
  KitchenPerformanceTicketKpisDto,
  KitchenPerformanceTicketLineItemDto,
  KitchenPerformanceTicketRowDto,
} from "../types/kitchenPerformance.types.js";
import {
  normalizeKdsReportingTimestampToUtcIso,
  sortKitchenPerformanceTicketsByTimeCreatedAsc,
} from "./kitchenPerformanceTimestamp.util.js";
import {
  computeKitchenPerformanceLateKpis,
  mergeKitchenPerformanceTicketLateFlag,
} from "./kitchenPerformanceLateKpis.util.js";
import {
  normalizeKitchenPerformanceTicketLateFlag,
  normalizeKitchenPerformanceTimeDue,
} from "./kitchenPerformanceTimeDue.util.js";
import { formatKitchenPerformanceItemPerformanceName } from "./kitchenPerformanceItemName.util.js";
import {
  buildKitchenPerformanceItemQuantityKey,
  resolveKitchenPerformanceItemTotalQuantity,
  sumDedupedKdsItemQuantitiesByItemKey,
} from "./kitchenPerformanceItemQuantity.util.js";
import { roundKitchenPerformanceAvgItemsPerTicket } from "./kitchenPerformanceKpiValues.util.js";
import { mapKitchenPerformanceStationType } from "./kitchenPerformanceStationType.util.js";
import {
  averageKdsItemCompletionSeconds,
  averageKdsTicketCompletionSeconds,
  computeKdsCompletionSeconds,
} from "./kitchenPerformanceItemDuration.util.js";
import {
  buildItemSalesModifierLookup,
  buildKitchenPerformanceTicketLineItem,
  formatKitchenPerformanceItemsInTicket,
} from "./kitchenPerformanceTicketLineItems.util.js";

function formatHourLabel(hour24: number): string {
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12} ${suffix}`;
}

function kdsStr(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function kdsNum(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (value == null || value === "") return null;
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTimestampField(value: string | null): string | null {
  return normalizeKdsReportingTimestampToUtcIso(value);
}

function parseKdsBoolean(value: unknown): boolean | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (text === "true" || text === "1" || text === "yes") return true;
  if (text === "false" || text === "0" || text === "no") return false;
  return null;
}

function parseKdsIsLate(value: unknown): boolean | null {
  return parseKdsBoolean(value);
}

export function mapKdsDeviceKpisByName(
  rows: Record<string, unknown>[],
): Map<string, KitchenPerformanceTicketKpisDto> {
  const byDevice = new Map<string, KitchenPerformanceTicketKpisDto>();
  for (const row of rows) {
    const deviceName = normalizeDeviceName(kdsStr(row, "KDS.device_code_name"));
    if (!deviceName) continue;
    byDevice.set(deviceName, {
      completedTickets: Math.round(kdsNum(row, "KDS.ticket_count") ?? 0),
      completedItems: Math.round(kdsNum(row, "KDS.total_line_items") ?? 0),
      avgCompletionTimeSeconds: null,
      recalledTickets: Math.round(kdsNum(row, "KDS.recall_count") ?? 0),
      avgItemsPerTicket: roundKitchenPerformanceAvgItemsPerTicket(
        kdsNum(row, "KDS.avg_line_items_per_ticket"),
      ),
      ticketsPastDueTime: 0,
      ticketsWithTimeDue: 0,
      ticketsLatePercent: null,
    });
  }
  return byDevice;
}

function computeAvgCompletionSecondsFromTicketRows(
  ticketRows: Record<string, unknown>[],
  deviceName: string,
): number | null {
  const durationByTicketKey = new Map<string, number>();

  for (const row of ticketRows) {
    if (normalizeDeviceName(kdsStr(row, "KDS.device_code_name")) !== deviceName)
      continue;

    const duration = computeKdsCompletionSeconds(
      kdsStr(row, "KDS.display_on_kds_at"),
      kdsStr(row, "KDS.actual_completed_at"),
    );
    if (duration == null) continue;

    const ticketKey = ticketKeyFromKdsRow(row);
    if (!ticketKey) continue;
    durationByTicketKey.set(ticketKey, duration);
  }

  return averageKdsTicketCompletionSeconds([...durationByTicketKey.values()]);
}

function ticketKeyFromKdsRow(row: Record<string, unknown>): string | null {
  const explicit = kdsStr(row, "KDS.ticket_key");
  if (explicit) return explicit;
  const ticketName = kdsStr(row, "KDS.ticket_name");
  const displayOnKdsAt = kdsStr(row, "KDS.display_on_kds_at");
  if (!ticketName && !displayOnKdsAt) return null;
  return `${ticketName ?? ""}::${displayOnKdsAt ?? ""}`;
}

/** Unique completed tickets per device (matches details tab dedupe by ticket_key). */
export function countUniqueKdsTicketsByDevice(
  ticketRows: Record<string, unknown>[],
): Map<string, number> {
  const keysByDevice = new Map<string, Set<string>>();

  for (const row of ticketRows) {
    const deviceName = normalizeDeviceName(kdsStr(row, "KDS.device_code_name"));
    const ticketKey = ticketKeyFromKdsRow(row);
    if (!deviceName || !ticketKey) continue;

    const keys = keysByDevice.get(deviceName) ?? new Set<string>();
    keys.add(ticketKey);
    keysByDevice.set(deviceName, keys);
  }

  return new Map(
    [...keysByDevice.entries()].map(([deviceName, keys]) => [
      deviceName,
      keys.size,
    ]),
  );
}

/** Station summary `ticket_count` can be 2x expeditor totals; align list with deduped ticket rows. */
export function applyDedupedTicketCountsToStationSummaryRows(
  listRows: KitchenPerformanceRowDto[],
  ticketRows: Record<string, unknown>[],
  mongoLocationId: string,
): void {
  const countByDevice = countUniqueKdsTicketsByDevice(ticketRows);

  for (const row of listRows) {
    if (row.locationId !== mongoLocationId) continue;
    const dedupedCount = countByDevice.get(row.deviceName);
    if (dedupedCount != null) {
      row.completedTickets = dedupedCount;
    }
  }
}

export function applyFlooredAvgCompletionToStationSummaryRows(
  listRows: KitchenPerformanceRowDto[],
  ticketRows: Record<string, unknown>[],
  mongoLocationId: string,
): void {
  for (const row of listRows) {
    if (row.locationId !== mongoLocationId) continue;
    const avg = computeAvgCompletionSecondsFromTicketRows(
      ticketRows,
      row.deviceName,
    );
    if (avg != null) {
      row.avgCompletionTimeSeconds = avg;
    }
  }
}

function normalizeDeviceName(value: string | null): string {
  return value?.trim() ?? "";
}

export function buildKitchenPerformanceDetailsCacheKey(
  locationId: string,
  deviceName: string,
): string {
  return `${locationId}::${deviceName}`;
}

export function mapKdsStationSummaryRows(
  rows: Record<string, unknown>[],
  mongoLocationId: string,
  fallbackLocationName: string,
): KitchenPerformanceRowDto[] {
  const mapped: KitchenPerformanceRowDto[] = [];
  for (const row of rows) {
    const deviceName = normalizeDeviceName(kdsStr(row, "KDS.device_code_name"));
    if (!deviceName) continue;
    const completedTickets = Math.round(kdsNum(row, "KDS.ticket_count") ?? 0);
    mapped.push({
      deviceName,
      type: mapKitchenPerformanceStationType(kdsStr(row, "KDS.station_type")),
      location: kdsStr(row, "KDS.location_name") ?? fallbackLocationName,
      locationId: mongoLocationId,
      completedTickets,
      avgCompletionTimeSeconds: 0,
    });
  }
  return mapped.sort((a, b) => {
    if (b.completedTickets !== a.completedTickets) {
      return b.completedTickets - a.completedTickets;
    }
    return a.deviceName.localeCompare(b.deviceName);
  });
}

interface LineItemParts {
  itemName: string;
  variation: string | null;
  quantity: number;
  recalledAt: string | null;
  orderId: string | null;
}

function buildLineItemsByTicket(
  lineItemRows: Record<string, unknown>[],
): Map<string, Map<string, LineItemParts[]>> {
  const byDevice = new Map<string, Map<string, LineItemParts[]>>();

  for (const row of lineItemRows) {
    const deviceName = normalizeDeviceName(kdsStr(row, "KDS.device_code_name"));
    const ticketKey = kdsStr(row, "KDS.ticket_key");
    const itemName = kdsStr(row, "KDS.item_name");
    const variation = kdsStr(row, "KDS.variation");
    if (!deviceName || !ticketKey || !itemName) continue;

    const quantity = Math.max(1, Math.round(kdsNum(row, "KDS.quantity") ?? 1));
    const recalledAt = kdsStr(row, "KDS.recalled_at");
    const orderId = kdsStr(row, "KDS.order_id");

    const deviceMap =
      byDevice.get(deviceName) ?? new Map<string, LineItemParts[]>();
    const ticketItems = deviceMap.get(ticketKey) ?? [];
    ticketItems.push({ itemName, variation, quantity, recalledAt, orderId });
    deviceMap.set(ticketKey, ticketItems);
    byDevice.set(deviceName, deviceMap);
  }

  return byDevice;
}

function mapTicketLineItems(
  parts: LineItemParts[],
  modifierLookup: Map<string, Map<string, string[]>>,
): KitchenPerformanceTicketLineItemDto[] {
  return parts.map((part) =>
    buildKitchenPerformanceTicketLineItem(
      part.itemName,
      part.variation,
      part.quantity,
      part.orderId,
      modifierLookup,
    ),
  );
}

function formatItemsInTicket(parts: LineItemParts[]): string | null {
  if (parts.length === 0) return null;
  return formatKitchenPerformanceItemsInTicket(
    parts.map((part) => ({
      itemName: part.itemName,
      variation: part.variation,
      quantity: part.quantity,
    })),
  );
}

function earliestRecall(parts: LineItemParts[]): string | null {
  const recalls = parts
    .map((p) => p.recalledAt)
    .filter((v): v is string => v != null);
  if (recalls.length === 0) return null;
  return recalls.sort()[0] ?? null;
}

function mapTicketRowsForDevice(
  ticketRows: Record<string, unknown>[],
  deviceName: string,
  lineItemsByTicket: Map<string, LineItemParts[]>,
  modifierLookup: Map<string, Map<string, string[]>>,
  timezone: string,
): KitchenPerformanceTicketRowDto[] {
  const byTicketKey = new Map<string, KitchenPerformanceTicketRowDto>();

  for (const row of ticketRows) {
    if (normalizeDeviceName(kdsStr(row, "KDS.device_code_name")) !== deviceName)
      continue;

    const ticketKey = ticketKeyFromKdsRow(row);
    if (!ticketKey) continue;
    const lineParts = kdsStr(row, "KDS.ticket_key")
      ? (lineItemsByTicket.get(kdsStr(row, "KDS.ticket_key")!) ?? [])
      : [];
    const rawCreated = kdsStr(row, "KDS.display_on_kds_at");
    const rawDue = kdsStr(row, "KDS.time_due");
    const rawCompleted = kdsStr(row, "KDS.actual_completed_at");
    const timeCreated = normalizeTimestampField(rawCreated);
    const timeCompleted = normalizeTimestampField(rawCompleted);
    const timeDue =
      parseKdsBoolean(row["KDS.has_time_due"]) === false
        ? null
        : normalizeKitchenPerformanceTimeDue(
            normalizeTimestampField(rawDue),
            timeCreated,
            rawDue,
            rawCreated,
          );
    const mapped: KitchenPerformanceTicketRowDto = {
      ticketName: kdsStr(row, "KDS.ticket_name"),
      orderSource: kdsStr(row, "KDS.order_source"),
      numberOfItems: kdsNum(row, "KDS.line_item_count"),
      itemsInTicket: formatItemsInTicket(lineParts),
      ticketLineItems: mapTicketLineItems(lineParts, modifierLookup),
      timeCreated,
      timeCompleted,
      timeDue,
      timeRecalled: normalizeTimestampField(earliestRecall(lineParts)),
      completionTimeSeconds: computeKdsCompletionSeconds(
        rawCreated,
        rawCompleted,
      ),
      isLate: normalizeKitchenPerformanceTicketLateFlag(
        parseKdsIsLate(row["KDS.is_late"]),
        timeDue,
      ),
    };

    const existing = byTicketKey.get(ticketKey);
    if (!existing) {
      byTicketKey.set(ticketKey, mapped);
      continue;
    }

    byTicketKey.set(ticketKey, {
      ...existing,
      isLate: mergeKitchenPerformanceTicketLateFlag(
        existing.isLate,
        mapped.isLate,
      ),
      timeDue: existing.timeDue ?? mapped.timeDue,
      numberOfItems: Math.max(
        existing.numberOfItems ?? 0,
        mapped.numberOfItems ?? 0,
      ),
      itemsInTicket: existing.itemsInTicket ?? mapped.itemsInTicket,
      ticketLineItems: existing.ticketLineItems ?? mapped.ticketLineItems,
      timeRecalled: existing.timeRecalled ?? mapped.timeRecalled,
    });
  }

  return sortKitchenPerformanceTicketsByTimeCreatedAsc(
    [...byTicketKey.values()],
    timezone,
  );
}

function mergeTicketKpisWithLateStats(
  baseKpis: KitchenPerformanceTicketKpisDto,
  ticketRows: KitchenPerformanceTicketRowDto[],
): KitchenPerformanceTicketKpisDto {
  const computed = computeKpisFromTicketRows(ticketRows);
  const completedTickets =
    ticketRows.length > 0
      ? ticketRows.length
      : baseKpis.completedTickets > 0
        ? baseKpis.completedTickets
        : computed.completedTickets;

  return {
    ...baseKpis,
    completedTickets,
    avgCompletionTimeSeconds: computed.avgCompletionTimeSeconds,
    recalledTickets: computed.recalledTickets,
    ...computeKitchenPerformanceLateKpis(ticketRows, completedTickets),
  };
}

function computeKpisFromTicketRows(
  ticketRows: KitchenPerformanceTicketRowDto[],
): KitchenPerformanceTicketKpisDto {
  const completionTimes = ticketRows
    .map((row) => row.completionTimeSeconds)
    .filter((value): value is number => value != null);
  const completedTickets = ticketRows.length;

  const completedItems = ticketRows.reduce((sum, ticket) => {
    if (ticket.numberOfItems != null) return sum + ticket.numberOfItems;
    return sum;
  }, 0);

  const recalledTickets = ticketRows.filter(
    (ticket) => ticket.timeRecalled != null,
  ).length;
  const completedTicketsForLate =
    completedTickets > 0 ? completedTickets : ticketRows.length;

  return {
    completedTickets,
    completedItems,
    avgCompletionTimeSeconds:
      completedTickets > 0
        ? averageKdsTicketCompletionSeconds(completionTimes)
        : null,
    recalledTickets,
    avgItemsPerTicket:
      completedTickets > 0
        ? roundKitchenPerformanceAvgItemsPerTicket(
            completedItems / completedTickets,
          )
        : null,
    ...computeKitchenPerformanceLateKpis(ticketRows, completedTicketsForLate),
  };
}

function mapHourlyForDevice(
  hourlyRows: Record<string, unknown>[],
  deviceName: string,
): KitchenPerformanceHourlyPointDto[] {
  const counts = new Array<number>(24).fill(0);
  for (const row of hourlyRows) {
    if (normalizeDeviceName(kdsStr(row, "KDS.device_code_name")) !== deviceName)
      continue;
    const hour = kdsNum(row, "KDS.local_hour");
    if (hour == null || hour < 0 || hour > 23) continue;
    counts[hour] =
      (counts[hour] ?? 0) + Math.round(kdsNum(row, "KDS.ticket_count") ?? 0);
  }
  return counts.map((completedTickets, hour24) => ({
    hour24,
    label: formatHourLabel(hour24),
    completedTickets,
  }));
}

function mapKdsItemBoundaryTimeSeconds(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return null;
  return Math.floor(raw);
}

function mapKdsItemAvgTimeSeconds(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  return averageKdsItemCompletionSeconds([raw]);
}

export function mapKdsItemPerformanceRows(
  rows: Record<string, unknown>[],
  lineItemRows: Record<string, unknown>[],
  deviceName: string,
): KitchenPerformanceItemPerformanceRowDto[] {
  const quantityByItemKey = sumDedupedKdsItemQuantitiesByItemKey(
    lineItemRows,
    deviceName,
  );
  const useDedupedQuantities = quantityByItemKey.size > 0;
  const mapped: KitchenPerformanceItemPerformanceRowDto[] = [];

  for (const row of rows) {
    if (normalizeDeviceName(kdsStr(row, "KDS.device_code_name")) !== deviceName) {
      continue;
    }

    const itemNameRaw = kdsStr(row, "KDS.item_name");
    const variation = kdsStr(row, "KDS.variation");
    const itemName = formatKitchenPerformanceItemPerformanceName(itemNameRaw, variation);
    if (!itemName || !itemNameRaw) continue;

    const quantityKey = buildKitchenPerformanceItemQuantityKey(itemNameRaw, variation);
    const dedupedQuantity = quantityByItemKey.get(quantityKey) ?? 0;
    const totalQuantity = useDedupedQuantities
      ? resolveKitchenPerformanceItemTotalQuantity(
          kdsNum(row, "KDS.quantity_sold") ?? 0,
          dedupedQuantity,
        )
      : Math.round(kdsNum(row, "KDS.quantity_sold") ?? 0);
    if (totalQuantity <= 0) continue;

    mapped.push({
      itemName,
      totalQuantity,
      avgCompletionTimeSeconds: mapKdsItemAvgTimeSeconds(
        kdsNum(row, "KDS.avg_item_time_seconds"),
      ),
      minCompletionTimeSeconds: mapKdsItemBoundaryTimeSeconds(
        kdsNum(row, "KDS.min_item_time_seconds"),
      ),
      maxCompletionTimeSeconds: mapKdsItemBoundaryTimeSeconds(
        kdsNum(row, "KDS.max_item_time_seconds"),
      ),
    });
  }

  return mapped.sort((a, b) => {
    if (b.totalQuantity !== a.totalQuantity) {
      return b.totalQuantity - a.totalQuantity;
    }
    return a.itemName.localeCompare(b.itemName);
  });
}

export function buildKitchenPerformanceDetailsByDevice(
  listRows: KitchenPerformanceRowDto[],
  ticketRows: Record<string, unknown>[],
  hourlyRows: Record<string, unknown>[],
  lineItemRows: Record<string, unknown>[],
  itemPerformanceRows: Record<string, unknown>[],
  deviceKpiRows: Record<string, unknown>[],
  itemSalesRows: Record<string, unknown>[],
  mongoLocationId: string,
  timezone: string,
): Record<string, KitchenPerformanceDetailsResult> {
  const modifierLookup = buildItemSalesModifierLookup(itemSalesRows);
  const lineItemsByDevice = buildLineItemsByTicket(lineItemRows);
  const deviceKpisByName = mapKdsDeviceKpisByName(deviceKpiRows);
  const detailsByKey: Record<string, KitchenPerformanceDetailsResult> = {};

  for (const listRow of listRows) {
    if (listRow.locationId !== mongoLocationId) continue;
    const deviceName = listRow.deviceName;
    const lineItemsByTicket = lineItemsByDevice.get(deviceName) ?? new Map();
    const mappedTickets = mapTicketRowsForDevice(
      ticketRows,
      deviceName,
      lineItemsByTicket,
      modifierLookup,
      timezone,
    );

    detailsByKey[
      buildKitchenPerformanceDetailsCacheKey(mongoLocationId, deviceName)
    ] = {
      kpis: mergeTicketKpisWithLateStats(
        deviceKpisByName.get(deviceName) ??
          computeKpisFromTicketRows(mappedTickets),
        mappedTickets,
      ),
      hourlyCompletedTickets: mapHourlyForDevice(hourlyRows, deviceName),
      ticketRows: mappedTickets,
      itemPerformanceRows: mapKdsItemPerformanceRows(
        itemPerformanceRows,
        lineItemRows,
        deviceName,
      ),
    };
  }

  return detailsByKey;
}

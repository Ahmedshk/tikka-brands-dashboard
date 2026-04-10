/**
 * Business-day UTC windows: `businessDateKey` yyyy-MM-dd is the calendar date (in location TZ)
 * when the business day *opens* (at businessStartTime). Matches getBusinessDayRangeForDate.
 */
import { formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";
import {
  getBusinessDayRangeForDate,
  getBusinessStartTimeRange,
  getStartOfDayUtc,
} from "./timezone.util.js";
import type { TimeRange } from "./businessHours.util.js";
import { iterBusinessDateKeysInclusive } from "./rollupScriptArgs.util.js";
import {
  addCivilMinutesToLocalYmdHm,
  wallClockZonedInstantFromYmdHm,
} from "./wallClockHourStart.util.js";

function parseBusinessStartHm(businessStartTime: string): { h: number; m: number } {
  const parts = (businessStartTime ?? "00:00").trim().split(":");
  const h = Number.parseInt(parts[0] ?? "0", 10);
  const m = Number.parseInt(parts[1] ?? "0", 10);
  return {
    h: Number.isFinite(h) ? h : 0,
    m: Number.isFinite(m) ? m : 0,
  };
}

function localYmdHmInTz(
  d: Date,
  timezone: string,
): { y: number; m0: number; d: number; h: number; mi: number } {
  const tz = timezone.trim() || "UTC";
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  });
  const parts = f.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    y: Number.parseInt(get("year"), 10),
    m0: Number.parseInt(get("month"), 10) - 1,
    d: Number.parseInt(get("day"), 10),
    h: Number.parseInt(get("hour"), 10),
    mi: Number.parseInt(get("minute"), 10),
  };
}

/** Parse yyyy-MM-dd to y, m0 (0-based month), d. */
export function parseYmdBusinessDateKey(businessDateKey: string): {
  y: number;
  m0: number;
  d: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(businessDateKey.trim());
  if (!match) {
    throw new Error(`Invalid businessDateKey (expected yyyy-MM-dd): ${businessDateKey}`);
  }
  const y = Number.parseInt(match[1]!, 10);
  const m0 = Number.parseInt(match[2]!, 10) - 1;
  const d = Number.parseInt(match[3]!, 10);
  return { y, m0, d };
}

/** Add calendar days to a yyyy-MM-dd key (UTC date arithmetic; matches rollup businessDateKey dates). */
export function addCalendarDaysToBusinessDateKey(
  ymd: string,
  deltaDays: number,
): string {
  const { y, m0, d } = parseYmdBusinessDateKey(ymd);
  const shifted = new Date(Date.UTC(y, m0, d + deltaDays));
  const y2 = shifted.getUTCFullYear();
  const m2 = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d2 = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
}

/** RFC 3339 TimeRange for one business day. */
export function businessDayUtcRangeIsoStrings(
  timezone: string,
  businessStartTime: string,
  businessDateKey: string,
): TimeRange {
  const { y, m0, d } = parseYmdBusinessDateKey(businessDateKey);
  return getBusinessDayRangeForDate(
    timezone.trim() || "UTC",
    (businessStartTime ?? "00:00").trim() || "00:00",
    y,
    m0,
    d,
  );
}

/** Previous calendar yyyy-MM-dd in `timeZone` (instant just before local midnight of `ymd`). */
export function previousYmdInTimezone(ymd: string, timeZone: string): string {
  const tz = timeZone.trim() || "UTC";
  const { y, m0, d } = parseYmdBusinessDateKey(ymd);
  const startOfYmd = getStartOfDayUtc(y, m0, d, tz);
  const probe = new Date(startOfYmd.getTime() - 1);
  return formatInTimeZone(probe, tz, "yyyy-MM-dd");
}

/**
 * Map an instant to the business date key whose business-day window contains it.
 */
export function businessDateKeyForInstant(
  instant: Date | string,
  timeZone: string,
  businessStartTime: string,
): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const tz = timeZone.trim() || "UTC";
  const bst = (businessStartTime ?? "00:00").trim() || "00:00";
  if (Number.isNaN(d.getTime())) {
    return formatInTimeZone(d, tz, "yyyy-MM-dd");
  }
  let key = formatInTimeZone(d, tz, "yyyy-MM-dd");
  let range = businessDayUtcRangeIsoStrings(tz, bst, key);
  const t = d.getTime();
  const rs = new Date(range.startAt).getTime();
  const re = new Date(range.endAt).getTime();
  if (t >= rs && t <= re) return key;
  const prevKey = previousYmdInTimezone(key, tz);
  range = businessDayUtcRangeIsoStrings(tz, bst, prevKey);
  const rs2 = new Date(range.startAt).getTime();
  const re2 = new Date(range.endAt).getTime();
  if (t >= rs2 && t <= re2) return prevKey;
  return key;
}

/**
 * Business date keys whose business-day UTC window intersects [startAt, endAt].
 */
export function businessDateKeysIntersectingUtcRange(
  startAt: string | Date,
  endAt: string | Date,
  timeZone: string,
  businessStartTime: string,
): string[] {
  const tz = timeZone.trim() || "UTC";
  const bst = (businessStartTime ?? "00:00").trim() || "00:00";
  const startMs = (typeof startAt === "string" ? new Date(startAt) : startAt).getTime();
  const endMs = (typeof endAt === "string" ? new Date(endAt) : endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
    return [];
  }
  const padStart = formatInTimeZone(
    addDays(new Date(startMs), -2),
    tz,
    "yyyy-MM-dd",
  );
  const padEnd = formatInTimeZone(addDays(new Date(endMs), 2), tz, "yyyy-MM-dd");
  const candidates = iterBusinessDateKeysInclusive(padStart, padEnd);
  const out: string[] = [];
  for (const key of candidates) {
    const { startAt: sa, endAt: ea } = businessDayUtcRangeIsoStrings(tz, bst, key);
    const rs = new Date(sa).getTime();
    const re = new Date(ea).getTime();
    if (re < startMs || rs > endMs) continue;
    out.push(key);
  }
  return out;
}

/**
 * Business-hour slot index (0–23) for `isoDateString` within that business day, or -1.
 * Uses civil (wall-clock) hours from business opening, not fixed SI-hour ticks, so local 23:xx
 * maps to slot 23 even on 23h/25h DST days.
 */
export function getBusinessHourIndexForBusinessDateKey(
  isoDateString: string,
  timezone: string,
  businessStartTime: string,
  businessDateKey: string,
): number {
  const orderDate = new Date(isoDateString);
  if (Number.isNaN(orderDate.getTime())) return -1;
  const tz = timezone.trim() || "UTC";
  const bst = (businessStartTime ?? "00:00").trim() || "00:00";
  const { startAt, endAt } = businessDayUtcRangeIsoStrings(tz, bst, businessDateKey);
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  const orderMs = orderDate.getTime();
  if (orderMs < startMs || orderMs > endMs) return -1;
  const { y: sy, m0: sm, d: sd } = parseYmdBusinessDateKey(businessDateKey);
  const { h: sh, m: smi } = parseBusinessStartHm(bst);
  const { y: oy, m0: om, d: od, h: oh, mi: omi } = localYmdHmInTz(orderDate, tz);
  const openDayMs = Date.UTC(sy, sm, sd);
  const orderDayMs = Date.UTC(oy, om, od);
  const dayDiff = Math.round((orderDayMs - openDayMs) / 86400000);
  const totalMinutes = dayDiff * 24 * 60 + (oh * 60 + omi) - (sh * 60 + smi);
  const index = Math.floor(totalMinutes / 60);
  return Math.max(0, Math.min(23, index));
}

/** Slot bounds for a specific business date (not "today" only). Civil-hour buckets from opening. */
export function getBusinessHourSlotBoundsForBusinessDateKey(
  timezone: string,
  businessStartTime: string,
  businessDateKey: string,
  slotIndex: number,
): { startAt: string; endAt: string } {
  const tz = timezone.trim() || "UTC";
  const bst = (businessStartTime ?? "00:00").trim() || "00:00";
  const { endAt } = businessDayUtcRangeIsoStrings(tz, bst, businessDateKey);
  const endMs = new Date(endAt).getTime();
  const slot = Math.max(0, Math.min(23, Math.floor(slotIndex)));
  const { y: sy, m0: sm, d: sd } = parseYmdBusinessDateKey(businessDateKey);
  const { h: sh, m: smi } = parseBusinessStartHm(bst);
  const startParts = addCivilMinutesToLocalYmdHm(sy, sm, sd, sh, smi, 60 * slot);
  const slotStartUtc = wallClockZonedInstantFromYmdHm(
    startParts.y,
    startParts.m0,
    startParts.d,
    startParts.h,
    startParts.mi,
    tz,
  );
  if (slot === 23) {
    return {
      startAt: slotStartUtc.toISOString(),
      endAt: new Date(endMs).toISOString(),
    };
  }
  const nextParts = addCivilMinutesToLocalYmdHm(sy, sm, sd, sh, smi, 60 * (slot + 1));
  const nextStartUtc = wallClockZonedInstantFromYmdHm(
    nextParts.y,
    nextParts.m0,
    nextParts.d,
    nextParts.h,
    nextParts.mi,
    tz,
  );
  const inclusiveEnd = Math.min(endMs, nextStartUtc.getTime() - 1);
  return {
    startAt: slotStartUtc.toISOString(),
    endAt: new Date(inclusiveEnd).toISOString(),
  };
}

/**
 * Business-hour slot for the current business-day window from {@link getBusinessStartTimeRange}.
 */
export function getBusinessHourIndex(
  isoDateString: string,
  timezone: string,
  businessStartTime: string,
): number {
  const orderDate = new Date(isoDateString);
  if (Number.isNaN(orderDate.getTime())) return -1;
  const tz = timezone.trim();
  const bst = (businessStartTime ?? "00:00").trim() || "00:00";
  const { startAt, endAt } = getBusinessStartTimeRange(tz, bst);
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  const orderMs = orderDate.getTime();
  if (orderMs < startMs || orderMs > endMs) return -1;
  const key = businessDateKeyForInstant(orderDate, tz, bst);
  return getBusinessHourIndexForBusinessDateKey(isoDateString, tz, bst, key);
}

/** Slot bounds for the current business day (same window as {@link getBusinessStartTimeRange}). */
export function getBusinessHourSlotBounds(
  timezone: string,
  businessStartTime: string,
  slotIndex: number,
): { startAt: string; endAt: string } {
  const tz = timezone.trim();
  const bst = (businessStartTime ?? "00:00").trim() || "00:00";
  const { startAt } = getBusinessStartTimeRange(tz, bst);
  const businessDateKey = businessDateKeyForInstant(new Date(startAt), tz, bst);
  return getBusinessHourSlotBoundsForBusinessDateKey(
    tz,
    bst,
    businessDateKey,
    slotIndex,
  );
}

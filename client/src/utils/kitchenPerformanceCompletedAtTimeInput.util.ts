export type KitchenPerformanceMeridiem = "AM" | "PM";

export interface KitchenPerformance12HourTimeParts {
  hour12: number;
  minute: number;
  meridiem: KitchenPerformanceMeridiem;
}

export const KITCHEN_PERFORMANCE_HOUR_12_OPTIONS = Array.from(
  { length: 12 },
  (_, index) => index + 1,
);

export const KITCHEN_PERFORMANCE_MINUTE_OPTIONS = Array.from(
  { length: 60 },
  (_, index) => index,
);

export function formatHmFrom12HourParts(parts: KitchenPerformance12HourTimeParts): string {
  let hour24: number;
  if (parts.hour12 === 12) {
    hour24 = parts.meridiem === "AM" ? 0 : 12;
  } else {
    hour24 = parts.meridiem === "PM" ? parts.hour12 + 12 : parts.hour12;
  }
  return `${String(hour24).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function parseHmTo12HourParts(hm: string): KitchenPerformance12HourTimeParts | null {
  const trimmed = hm.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const hourPart = match[1];
  const minutePart = match[2];
  if (hourPart == null || minutePart == null) return null;

  const hour24 = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart, 10);
  if (
    !Number.isFinite(hour24) ||
    !Number.isFinite(minute) ||
    hour24 < 0 ||
    hour24 > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const meridiem: KitchenPerformanceMeridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, meridiem };
}

export function formatKitchenPerformanceMinuteLabel(minute: number): string {
  return String(minute).padStart(2, "0");
}

/** Returns 24-hour `HH:mm` when all draft parts are valid; otherwise an empty string. */
export function tryFormatHmFrom12HourDraft(
  hour12Raw: string,
  minuteRaw: string,
  meridiemRaw: string,
): string {
  if (!hour12Raw || !minuteRaw || !meridiemRaw) return "";

  const hour12 = Number.parseInt(hour12Raw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  const meridiem = meridiemRaw as KitchenPerformanceMeridiem;
  if (
    !Number.isFinite(hour12) ||
    hour12 < 1 ||
    hour12 > 12 ||
    !Number.isFinite(minute) ||
    minute < 0 ||
    minute > 59 ||
    (meridiem !== "AM" && meridiem !== "PM")
  ) {
    return "";
  }

  return formatHmFrom12HourParts({ hour12, minute, meridiem });
}

export function isKitchenPerformance12HourTimeDraftComplete(
  hour12Raw: string,
  minuteRaw: string,
  meridiemRaw: string,
): boolean {
  return tryFormatHmFrom12HourDraft(hour12Raw, minuteRaw, meridiemRaw) !== "";
}

import type { LocationApiParams } from "./locationSelectionHelpers";

export function buildKitchenPerformanceReportCacheKey(
  locationApiParams: LocationApiParams,
  startDate: string,
  endDate: string,
): string {
  const scope =
    locationApiParams.locationIds?.length
      ? [...locationApiParams.locationIds].sort().join(",")
      : (locationApiParams.locationId ?? "");
  return JSON.stringify({ scope, startDate, endDate });
}

export function buildKitchenPerformanceDetailsCacheKey(
  locationId: string,
  deviceName: string,
): string {
  return `${locationId}::${deviceName}`;
}

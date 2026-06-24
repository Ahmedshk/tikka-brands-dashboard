import type { KitchenPerformanceRow } from '../types/kitchenPerformance.types';

export function buildKitchenPerformanceListUrl(startDate: string, endDate: string): string {
  return `/dashboard/kitchen-performance?startDate=${startDate}&endDate=${endDate}`;
}

export function buildKitchenPerformanceDeviceDetailsUrl(params: {
  deviceName: string;
  startDate: string;
  endDate: string;
  locationId?: string;
}): string {
  const encoded = encodeURIComponent(params.deviceName);
  const locationQuery = params.locationId
    ? `&locationId=${encodeURIComponent(params.locationId)}`
    : '';
  return `/dashboard/kitchen-performance/${encoded}?startDate=${params.startDate}&endDate=${params.endDate}${locationQuery}`;
}

export function buildKitchenPerformanceDeviceDetailsUrlFromRow(
  row: KitchenPerformanceRow,
  startDate: string,
  endDate: string,
  fallbackLocationId?: string,
): string {
  const locationId = row.locationId ?? fallbackLocationId ?? '';
  return buildKitchenPerformanceDeviceDetailsUrl({
    deviceName: row.deviceName,
    startDate,
    endDate,
    locationId: locationId || undefined,
  });
}

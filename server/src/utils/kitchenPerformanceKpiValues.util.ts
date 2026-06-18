export function roundKitchenPerformanceAvgItemsPerTicket(
  value: number | null | undefined,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
}

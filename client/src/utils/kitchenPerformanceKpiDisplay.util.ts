export function formatKitchenPerformanceAvgItemsPerTicket(
  value: number | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

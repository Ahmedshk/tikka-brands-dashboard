/** USD with 2 decimal places (e.g. net sales, SPMH in $/hr). */
function formatUsd2(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatPct2(n: number): string {
  return `${n.toFixed(2)}%`;
}

function formatHours2(n: number): string {
  return `${n.toFixed(2)} hours`;
}

function formatUsdPerHour2(n: number): string {
  return `${formatUsd2(n)}/hr`;
}

export type FinancialMetricKeyForAlert =
  | "sales"
  | "laborCostPct"
  | "hours"
  | "spmh"
  | "foodCostPct";

/**
 * Two rows for alert email: goal and current, with units (matches Command Center / goal semantics).
 */
export function buildFinancialKpiEmailRows(
  metricKey: FinancialMetricKeyForAlert,
  goal: number,
  actual: number,
): Array<{ label: string; value: string }> {
  switch (metricKey) {
    case "sales":
      return [
        { label: "Goal (net sales)", value: formatUsd2(goal) },
        { label: "Current (net sales)", value: formatUsd2(actual) },
      ];
    case "laborCostPct":
      return [
        { label: "Goal (labor cost %)", value: formatPct2(goal) },
        { label: "Current (labor cost %)", value: formatPct2(actual) },
      ];
    case "hours":
      return [
        { label: "Goal (hours)", value: formatHours2(goal) },
        { label: "Current (hours)", value: formatHours2(actual) },
      ];
    case "spmh":
      return [
        { label: "Goal (SPMH)", value: formatUsdPerHour2(goal) },
        { label: "Current (SPMH)", value: formatUsdPerHour2(actual) },
      ];
    case "foodCostPct":
      return [
        { label: "Goal (food cost %)", value: formatPct2(goal) },
        { label: "Current (food cost %)", value: formatPct2(actual) },
      ];
    default:
      return [];
  }
}

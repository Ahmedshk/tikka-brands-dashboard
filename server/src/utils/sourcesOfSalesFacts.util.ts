import { normalizeSourcesOfSalesSegmentId } from "./squareSourcesOfSalesMerge.util.js";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function addCentsToSourcesOfSalesCentsById(
  byId: Map<string, number>,
  rawId: string,
  cents: number,
): void {
  const id = normalizeSourcesOfSalesSegmentId(rawId);
  if (!id) return;
  if (!Number.isFinite(cents) || cents <= 0) return;
  byId.set(id, (byId.get(id) ?? 0) + Math.round(cents));
}

/** Minimal summable rollup representation: `{ id, amount }` (USD currency string). */
export function sourcesOfSalesFactsFromCentsById(
  byId: Map<string, number>,
): Array<{ id: string; amount: string }> {
  const keys = [...byId.keys()].sort((a, b) => a.localeCompare(b));
  return keys
    .map((id) => {
      const cents = byId.get(id) ?? 0;
      if (!Number.isFinite(cents) || cents <= 0) return null;
      return { id, amount: USD.format(cents / 100) };
    })
    .filter((x): x is { id: string; amount: string } => x != null);
}


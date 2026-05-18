import { generateDistinctColors } from "./colorPalette.util.js";

export function mergeCentsByIdInto(
  target: Map<string, number>,
  src: ReadonlyMap<string, number>,
): Map<string, number> {
  for (const [id, cents] of src) {
    target.set(id, (target.get(id) ?? 0) + cents);
  }
  return target;
}

export function normalizeSourcesOfSalesSegmentId(id: string): string {
  const normalized = id.trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "in-store" || normalized === "pickup") return "register";
  return normalized;
}

function segmentIdToLabel(id: string): string {
  if (id === "register") return "Register";
  return id
    .replaceAll("-", " ")
    .replaceAll(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Sum `amount` strings per segment `id` for a single rollup `sourcesOfSales` array (cents).
 */
export function sumSourcesOfSalesSegmentsToCentsById(
  segments: unknown[] | undefined,
): Map<string, number> {
  const byId = new Map<string, number>();
  if (!Array.isArray(segments)) return byId;
  for (const raw of segments) {
    const r = raw as { id?: string; amount?: string };
    const idRaw = typeof r.id === "string" ? r.id : "";
    const id = idRaw ? normalizeSourcesOfSalesSegmentId(idRaw) : "";
    if (!id) continue;
    const amount = typeof r.amount === "string" ? r.amount : "$0.00";
    const n = Number.parseFloat(amount.replaceAll(/[$,]/g, ""));
    const cents = Math.round(n * 100);
    if (!Number.isFinite(cents)) continue;
    byId.set(id, (byId.get(id) ?? 0) + cents);
  }
  return byId;
}

/**
 * Sum `sourcesOfSales` segment cents across multiple daily rollup docs,
 * keyed by normalized segment id.
 */
export function sumSourcesOfSalesCentsByIdFromDailyRollupDocs(
  docs: Array<{ sourcesOfSales?: unknown[] }>,
): Map<string, number> {
  const byId = new Map<string, number>();
  for (const doc of docs) {
    for (const [id, cents] of sumSourcesOfSalesSegmentsToCentsById(
      doc.sourcesOfSales,
    )) {
      byId.set(id, (byId.get(id) ?? 0) + cents);
    }
  }
  return byId;
}

/**
 * Render `SourcesOfSalesSegment[]`-shaped objects (id, label, value, amount,
 * color) from a cents-by-id map. Used both by rollup docs and any merged
 * split-range total.
 */
export function renderSourcesOfSalesSegmentsFromCentsById(
  byId: Map<string, number>,
): unknown[] {
  const totalCents = [...byId.values()].reduce((a, b) => a + b, 0);
  if (totalCents <= 0) return [];
  const keys = [...byId.keys()].sort((a, b) => a.localeCompare(b));
  const colors = generateDistinctColors(keys.length, { nonAdjacent: true });
  return keys.map((key, index) => {
    const amountCents = byId.get(key) ?? 0;
    const value = Math.round((amountCents / totalCents) * 1000) / 10;
    const amountDollars = amountCents / 100;
    const amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountDollars);
    return {
      id: key,
      label: segmentIdToLabel(key),
      value,
      amount,
      color: colors[index] ?? "#888888",
    };
  });
}

/**
 * Merge `sourcesOfSales` arrays from multiple daily rollup docs (sum `amount` strings per `id`).
 */
export function mergeSourcesOfSalesFromDailyRollupDocs(
  docs: Array<{ sourcesOfSales?: unknown[] }>,
): unknown[] {
  return renderSourcesOfSalesSegmentsFromCentsById(
    sumSourcesOfSalesCentsByIdFromDailyRollupDocs(docs),
  );
}

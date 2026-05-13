/** First non-null created-at field on `raw` or nested non-array `raw.order`. */
export function pickCreatedAtCandidateFromSquareOrderRaw(
  raw: Record<string, unknown>,
): unknown {
  const nestedOrder =
    typeof raw.order === "object" && raw.order != null && !Array.isArray(raw.order)
      ? (raw.order as Record<string, unknown>)
      : undefined;
  const fromNested =
    nestedOrder === undefined ? undefined : (nestedOrder.created_at ?? nestedOrder.createdAt);
  return raw.created_at ?? raw.createdAt ?? fromNested;
}

export function coerceSquareOrderCreatedAtCandidateToUnixMs(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const t = v > 1e12 ? v : v * 1000;
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

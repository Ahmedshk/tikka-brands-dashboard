/**
 * Resolve Square entity `id` from cached raw JSON without `String(object)` → `[object Object]`.
 */
export function squareRawIdAsString(rawId: unknown, fallback: string): string {
  if (typeof rawId === "string") {
    const t = rawId.trim();
    if (t.length > 0) return t;
  }
  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    return String(rawId);
  }
  return fallback;
}

/** Normalize module progress `completedAt` after Zod union parse (Date | ISO string | null). */
export function parseModuleProgressCompletedAtInput(
  v: Date | string | null,
): Date | null {
  if (v == null || v === "") {
    return null;
  }
  if (v instanceof Date) {
    return v;
  }
  return new Date(v);
}

export function getHomebaseTimecardClockInAt(
  card: Record<string, unknown>,
): Date | null {
  const ci = card.clock_in;
  if (ci == null) return null;
  if (ci instanceof Date) {
    const t = ci.getTime();
    return Number.isFinite(t) ? ci : null;
  }
  if (typeof ci === "string" && ci.trim() !== "") {
    const d = new Date(ci);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

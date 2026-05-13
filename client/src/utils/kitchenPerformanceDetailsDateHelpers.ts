export function isValidYmd(s: string | null): boolean {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

export function formatYmdShort(ymd: string): string {
  const parsed = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return ymd;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


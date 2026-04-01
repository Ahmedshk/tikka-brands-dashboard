const FALLBACK = 'rgba(107, 114, 128, 0.35)';

/** Map stored hex (#RRGGBB or #RRGGBBAA) to a calendar cell background. */
export function colorHexToCalendarBackground(hex: string): string {
  const h = hex.replace('#', '').trim();
  if (h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = parseInt(h.slice(6, 8), 16) / 255;
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return FALLBACK;
    return `rgba(${r},${g},${b},${a})`;
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return FALLBACK;
    return `rgba(${r},${g},${b},0.35)`;
  }
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  return FALLBACK;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Convert "HH:00" or "HH:mm" to "12 am", "01 am", "12 pm", "01 pm", etc. */
export function formatHourToAmPm(hourStr: string): string {
  const parts = hourStr.trim().split(':');
  const h = Number.parseInt(parts[0] ?? '0', 10) % 24;
  if (h === 0) return '12 am';
  if (h === 12) return '12 pm';
  if (h < 12) return `${String(h).padStart(2, '0')} am`;
  return `${String(h - 12).padStart(2, '0')} pm`;
}

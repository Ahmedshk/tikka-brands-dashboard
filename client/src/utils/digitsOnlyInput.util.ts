/**
 * Interval schedule fields: integers only. Strips e/E (scientific notation), decimal point, signs, etc.
 */
export function sanitizeDigitsOnlyInput(raw: string): string {
  return raw.replaceAll(/\D/g, "");
}

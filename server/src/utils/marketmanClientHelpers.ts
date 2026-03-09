/**
 * Helpers for MarketMan API client. Extracted to keep cognitive complexity low.
 */

/**
 * Parse MarketMan response text to JSON. Throws on non-JSON when status/path are provided for error message.
 */
export function parseMarketManResponse<T>(
  text: string,
  status: number,
  path: string,
): T & { ErrorMessage?: string } {
  if (!text.trim()) {
    return {} as T & { ErrorMessage?: string };
  }
  try {
    return JSON.parse(text) as T & { ErrorMessage?: string };
  } catch {
    throw new Error(
      `MarketMan ${path} returned non-JSON (${status}): ${text.slice(0, 150)}`,
    );
  }
}

/**
 * Extracts a user-facing message from an API error (e.g. Axios error with response.data.message).
 * Returns null if no message can be determined.
 */
export function getResponseMessageFromError(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  if (!('response' in err)) return null;
  const response = (err as { response: unknown }).response;
  if (!response || typeof response !== 'object') return null;
  if (!('data' in response)) return null;
  const data = (response as { data: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  if (!('message' in data)) return null;
  const message = (data as { message: unknown }).message;
  return typeof message === 'string' ? message : null;
}

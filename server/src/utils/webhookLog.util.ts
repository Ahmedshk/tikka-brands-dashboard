/**
 * Shared helpers for emitting consistent `[ts] <source> webhook: received` console logs
 * across webhook entrypoints (Square, Adobe Sign, MarketMan, etc.). These complement the
 * structured `logger.*` calls — they exist so that webhook traffic is always visible in
 * raw stdout/PM2 logs even when the structured logger is filtered.
 */

export function webhookLogTs(): string {
  return new Date().toISOString();
}

export function logWebhookReceived(
  source: string,
  fields: Record<string, unknown> = {},
): void {
  console.log(`[${webhookLogTs()}] ${source} webhook: received`, fields);
}

export function logWebhookResponse(
  source: string,
  fields: Record<string, unknown> = {},
): void {
  console.log(`[${webhookLogTs()}] ${source} webhook: response`, fields);
}

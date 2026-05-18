import { logger } from './logger.util.js';

/**
 * Shared helpers for webhook console logs and structured logging.
 * On warn/error, the complete received webhook body is included when provided.
 */

export type WebhookSource = 'Square' | 'MarketMan';

/** Sources that emit webhook console lines but do not use warn/error body attachment. */
export type WebhookLogSource = WebhookSource | 'Adobe Sign';

export function webhookLogTs(): string {
  return new Date().toISOString();
}

function mergeWebhookMeta(
  fields: Record<string, unknown> | undefined,
  webhookReceived: unknown,
): Record<string, unknown> | undefined {
  const base = fields ?? {};
  if (webhookReceived === undefined) {
    return Object.keys(base).length > 0 ? base : undefined;
  }
  return { ...base, webhookReceived };
}

function emitWebhookConsole(
  stream: 'log' | 'warn' | 'error',
  source: WebhookLogSource,
  detail: string,
  fields?: Record<string, unknown>,
  webhookReceived?: unknown,
): void {
  const prefix = `[${webhookLogTs()}] ${source} webhook: ${detail}`;
  const emit = stream === 'log' ? console.log : stream === 'warn' ? console.warn : console.error;

  if (fields === undefined) {
    emit(prefix);
  } else {
    emit(prefix, fields);
  }

  if (webhookReceived !== undefined) {
    emit(`[${webhookLogTs()}] ${source} webhook: received (full)`, webhookReceived);
  }
}

export function logWebhookReceived(
  source: WebhookLogSource,
  fields: Record<string, unknown> = {},
): void {
  emitWebhookConsole('log', source, 'received', fields);
}

export function logWebhookResponse(
  source: WebhookLogSource,
  fields: Record<string, unknown> = {},
): void {
  emitWebhookConsole('log', source, 'response', fields);
}

export function logWebhookWarn(
  source: WebhookSource,
  detail: string,
  fields?: Record<string, unknown>,
  webhookReceived?: unknown,
): void {
  const message = `${source} webhook: ${detail}`;
  logger.warn(message, mergeWebhookMeta(fields, webhookReceived));
  emitWebhookConsole('warn', source, detail, fields, webhookReceived);
}

export function logWebhookError(
  source: WebhookSource,
  detail: string,
  fields?: Record<string, unknown>,
  webhookReceived?: unknown,
): void {
  const message = `${source} webhook: ${detail}`;
  logger.error(message, mergeWebhookMeta(fields, webhookReceived));
  emitWebhookConsole('error', source, detail, fields, webhookReceived);
}

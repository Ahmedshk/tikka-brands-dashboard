import { logger } from './logger.util.js';

/**
 * Shared helpers for webhook structured logging (Pino → master / application / warn / error files).
 * On warn/error, the complete received webhook body is included in `webhookReceived` when provided.
 */

export type WebhookSource = 'Square' | 'MarketMan';

/** Sources that emit webhook log lines but do not use warn/error body attachment. */
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

function emitWebhookLog(
  level: 'info' | 'warn' | 'error',
  source: WebhookLogSource,
  detail: string,
  fields?: Record<string, unknown>,
  webhookReceived?: unknown,
): void {
  const message = `${source} webhook: ${detail}`;
  const meta = mergeWebhookMeta(
    { webhookSource: source, ...fields },
    webhookReceived,
  );

  if (level === 'info') {
    if (meta) {
      logger.info(message, meta);
    } else {
      logger.info(message);
    }
    return;
  }
  if (level === 'warn') {
    logger.warn(message, meta);
    return;
  }
  logger.error(message, meta);
}

export function logWebhookReceived(
  source: WebhookLogSource,
  fields: Record<string, unknown> = {},
): void {
  emitWebhookLog('info', source, 'received', fields);
}

export function logWebhookResponse(
  source: WebhookLogSource,
  fields: Record<string, unknown> = {},
): void {
  emitWebhookLog('info', source, 'response', fields);
}

/** Pipeline / handler detail between received and response (e.g. rollup skipped). */
export function logWebhookInfo(
  source: WebhookSource,
  detail: string,
  fields?: Record<string, unknown>,
): void {
  emitWebhookLog('info', source, detail, fields);
}

export function logWebhookWarn(
  source: WebhookSource,
  detail: string,
  fields?: Record<string, unknown>,
  webhookReceived?: unknown,
): void {
  emitWebhookLog('warn', source, detail, fields, webhookReceived);
}

export function logWebhookError(
  source: WebhookSource,
  detail: string,
  fields?: Record<string, unknown>,
  webhookReceived?: unknown,
): void {
  emitWebhookLog('error', source, detail, fields, webhookReceived);
}

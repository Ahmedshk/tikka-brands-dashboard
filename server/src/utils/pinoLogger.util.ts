/**
 * Pino-backed logger. Replaces the previous winston setup.
 *
 * Why pino: on Azure App Service (and any environment where `process.stdout`
 * is piped to a log collector instead of a TTY), Node's stdout writes are
 * synchronous and block the event loop until the consumer reads. Winston
 * wrote to stdout + multiple files inline on the main thread, which under
 * the dashboard's hot path produced ~150-200ms of event-loop blocking per
 * log line. Across ~50-70 log lines per all-locations request that was the
 * ~15-second per-worker stall the timing instrumentation surfaced.
 *
 * Pino's transports run in **worker threads** — the main thread hands log
 * records to a thread via a ring buffer and never blocks on I/O or
 * formatting. Same five-file layout as before (`master`, `application`,
 * `warn`, `error`, `debug`), each rotated daily with 30-day retention via
 * `pino-roll`. Console output goes through `pino-pretty` in dev and JSON to
 * stdout in production.
 *
 * Same exported surface as the old `winstonLogger.util.ts`: `logInfo`,
 * `logWarn`, `logError`, `logDebug`, and `LOGS_DIR`. New export:
 * `flushLogger()` so graceful shutdown paths can await pending writes
 * before `process.exit`.
 *
 * Out-of-scope (intentionally): 26 files in the codebase use `console.log`
 * directly (rollup scripts, controller request audit logs in
 * `splitRangeReadLogging.util.ts`, etc.). Those bypass this module
 * deliberately and aren't migrated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino, { type Logger, type Level } from 'pino';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolved `server/logs` directory (preserved from the winston setup). */
export const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

/** Mirrors the previous winston behavior: skip file transports in test or when explicitly disabled. */
function shouldEnableLogFiles(): boolean {
  if (
    process.env.DISABLE_FILE_LOGS === '1' ||
    process.env.DISABLE_FILE_LOGS === 'true'
  ) {
    return false;
  }
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  return true;
}

interface TransportTargetOptions {
  target: string;
  level?: Level;
  options?: Record<string, unknown>;
}

/** Shared `pino-roll` options: daily rotation, 30-day retention, `.log` extension. */
function rollOptionsFor(basename: string): Record<string, unknown> {
  return {
    file: path.join(LOGS_DIR, basename),
    frequency: 'daily',
    dateFormat: 'yyyy-MM-dd',
    extension: '.log',
    mkdir: true,
    limit: { count: 30 },
  };
}

/**
 * Pino transport target identifier for the `pinoExactLevelTransport.cjs`
 * worker module — returned as a `file://` URL string, NOT a filesystem path.
 *
 * Why a URL rather than a path: in multi-target mode pino's worker uses
 * `'file://' + target` to load the module via dynamic import. On Windows an
 * absolute filesystem path (`D:\\Projects\\...`) becomes
 * `'file://D:\\Projects\\...'`, which is an invalid URL — pino's worker
 * silently rejects ALL transports in the array when this happens, producing
 * an empty-output failure mode. Passing a real `file://` URL up front
 * sidesteps the bad concatenation.
 *
 * The `.cjs` file lives next to this module — the `build` script in
 * `package.json` copies it from `src/utils/` to `dist/utils/` after `tsc` so
 * the URL resolves correctly under both dev (tsx) and prod (compiled).
 */
function exactLevelTransportTarget(): string {
  return new URL('./pinoExactLevelTransport.cjs', import.meta.url).href;
}

function buildTransportTargets(): TransportTargetOptions[] {
  const targets: TransportTargetOptions[] = [];

  // Console destination — dev gets pino-pretty (colored, human-readable);
  // production writes JSON directly to stdout where Azure/etc. ingest it.
  const consoleLevel: Level =
    (process.env.LOG_CONSOLE_LEVEL as Level | undefined) ??
    (process.env.NODE_ENV === 'development' ? 'debug' : 'info');
  if (process.env.NODE_ENV === 'production') {
    targets.push({
      target: 'pino/file',
      level: consoleLevel,
      options: { destination: 1 }, // fd 1 = stdout, async via SonicBoom
    });
  } else {
    targets.push({
      target: 'pino-pretty',
      level: consoleLevel,
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    });
  }

  // File transports — match the winston layout exactly: one master file with
  // every level, plus four per-level files filtered via the exact-match
  // transport so each file contains only its named level (info-only,
  // warn-only, error-only, debug-only).
  if (shouldEnableLogFiles()) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const filterTarget = exactLevelTransportTarget();

    targets.push({
      target: 'pino-roll',
      level: 'debug',
      options: rollOptionsFor('master'),
    });

    // Numeric levels — must match pino's internal level numbers because the
    // multi-target dispatcher and our custom filter both compare against the
    // raw `level` field in each record's JSON (which is numeric, not a label).
    const perLevelFiles: Array<{ name: string; onlyLevel: number }> = [
      { name: 'application', onlyLevel: 30 }, // info
      { name: 'warn', onlyLevel: 40 },
      { name: 'error', onlyLevel: 50 },
      { name: 'debug', onlyLevel: 20 },
    ];
    for (const { name, onlyLevel } of perLevelFiles) {
      targets.push({
        // Use a file:// URL (not a raw filesystem path) so pino's multi-
        // target worker can load the module cross-platform. See the
        // `exactLevelTransportTarget()` comment for why this matters.
        target: filterTarget,
        // Worker receives every record at debug+ — filtering to the exact
        // level happens inside `pinoExactLevelTransport.cjs`.
        level: 'debug',
        options: {
          onlyLevel,
          ...rollOptionsFor(name),
        },
      });
    }
  }

  return targets;
}

function buildLogger(): Logger {
  const transport = pino.transport({ targets: buildTransportTargets() });
  return pino(
    {
      level: 'debug', // root threshold — transport-level filtering happens above
      timestamp: pino.stdTimeFunctions.isoTime,
      // Drop pino's default `pid` and `hostname` fields. The codebase's
      // log lines never reference them and dropping them keeps the JSON
      // payloads aligned with what winston produced. (`null` rather than
      // `undefined` here because pino's typing under
      // `exactOptionalPropertyTypes` only accepts `null` or an object.)
      base: null,
      // NOTE: pino writes `"level":30` (numeric) by default. We previously
      // attempted to convert to the label string via `formatters.level` for
      // log readability, but pino's multi-target `multistream` dispatcher
      // filters records by comparing the (numeric) `level` field against
      // each target's threshold — flipping it to a string broke all
      // dispatch silently. Downstream jq can map 30→"info" / 40→"warn" /
      // 50→"error" trivially; the simpler, working semantics are worth it.
      // Serialize `err`/Error inputs into `{ type, message, stack }` so
      // callers passing `logger.error('...', { err })` keep the stack.
      serializers: { err: pino.stdSerializers.err },
    },
    transport,
  );
}

const rootLogger = buildLogger();

/**
 * Normalize the legacy `(message, data)` second argument into a pino-friendly
 * meta object. Mirrors the helper that lived in `winstonLogger.util.ts`.
 *  - Plain object → returned as-is (becomes the record's top-level fields).
 *  - `undefined` → no meta.
 *  - Anything else (string, number, array, Error) → wrapped in `{ data }`.
 */
function normalizeMeta(data: unknown): Record<string, unknown> | undefined {
  if (data === undefined) {
    return undefined;
  }
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return { data };
}

// Pino's call signature is `logger.info(meta, message)` — REVERSED from
// winston's `(message, meta)`. These wrappers preserve the existing
// `(message, data)` adapter API in `logger.util.ts` so the 76 caller files
// don't need to change.
export function logInfo(message: string, data?: unknown): void {
  const meta = normalizeMeta(data);
  if (meta) {
    rootLogger.info(meta, message);
  } else {
    rootLogger.info(message);
  }
}

export function logWarn(message: string, data?: unknown): void {
  const meta = normalizeMeta(data);
  if (meta) {
    rootLogger.warn(meta, message);
  } else {
    rootLogger.warn(message);
  }
}

export function logError(message: string, data?: unknown): void {
  const meta = normalizeMeta(data);
  if (meta) {
    rootLogger.error(meta, message);
  } else {
    rootLogger.error(message);
  }
}

export function logDebug(message: string, data?: unknown): void {
  const meta = normalizeMeta(data);
  if (meta) {
    rootLogger.debug(meta, message);
  } else {
    rootLogger.debug(message);
  }
}

/**
 * Resolve when all pending log records have been handed off to transport
 * workers. Used by graceful shutdown so SIGTERM/SIGINT don't lose the last
 * few logs in flight.
 *
 * Note: worker-thread transports flush asynchronously. `flushLogger()`
 * triggers pino's flush and resolves when pino's main-thread queue is
 * drained, but the transport worker may still be writing to its destination
 * for a few milliseconds after this resolves. For server shutdown that's
 * fine — the worker process keeps running until pino's transport thread
 * naturally exits.
 */
export async function flushLogger(): Promise<void> {
  return new Promise((resolve) => {
    rootLogger.flush(() => resolve());
  });
}

/**
 * Process-level error handlers. Winston's `handleExceptions: true` /
 * `handleRejections: true` is replaced by these explicit listeners.
 *
 * Worker-thread transports can't be flushed synchronously the way pino's
 * default destination could (so `pino.final()` isn't a drop-in here). We
 * race the async flush against a 500ms timeout so a stuck transport doesn't
 * hang the dying process forever.
 */
async function bestEffortFlush(): Promise<void> {
  await Promise.race([
    flushLogger(),
    new Promise<void>((resolve) => setTimeout(resolve, 500)),
  ]);
}

process.on('uncaughtException', (err) => {
  rootLogger.error({ err }, 'uncaughtException');
  void bestEffortFlush().finally(() => process.exit(1));
});
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  rootLogger.error({ err }, 'unhandledRejection');
  void bestEffortFlush().finally(() => process.exit(1));
});

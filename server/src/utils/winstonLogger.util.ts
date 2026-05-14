import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { escSeq } from './ansiLog.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolved `server/logs` (same folder level as `server/package.json`). */
export const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

const RETENTION = '30d';
const DATE_PATTERN = 'YYYY-MM-DD';

function shouldEnableLogFiles(): boolean {
  if (process.env.DISABLE_FILE_LOGS === '1' || process.env.DISABLE_FILE_LOGS === 'true') {
    return false;
  }
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  return true;
}

function rotateFileBase(basename: string) {
  return {
    dirname: LOGS_DIR,
    filename: `${basename}-%DATE%.log`,
    datePattern: DATE_PATTERN,
    maxFiles: RETENTION,
    zippedArchive: false,
    auditFile: path.join(LOGS_DIR, `.audit-${basename}.json`),
  };
}

const levelOnly = (level: string) => winston.format((info) => (info.level === level ? info : false))();

function stringifyMeta(meta: Record<string, unknown>): string {
  try {
    return JSON.stringify(meta);
  } catch {
    return '[Unserializable meta]';
  }
}

function formatPlainLine(info: winston.Logform.TransformableInfo): string {
  const { level, message, timestamp } = info;
  const meta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(info)) {
    if (key === 'level' || key === 'message' || key === 'timestamp' || key === 'splat') {
      continue;
    }
    meta[key] = value;
  }
  const extra = Object.keys(meta).length ? ` ${stringifyMeta(meta)}` : '';
  return `${String(timestamp)} ${String(level).toUpperCase()} ${String(message)}${extra}\n`;
}

const plainFileFormat = winston.format.combine(
  winston.format.timestamp({ format: () => new Date().toISOString() }),
  winston.format.printf((info) => formatPlainLine(info)),
);

const exceptionLineFormat = winston.format.combine(
  winston.format.timestamp({ format: () => new Date().toISOString() }),
  winston.format.printf((info) => {
    const stack = typeof info.stack === 'string' ? `\n${info.stack}` : '';
    return `${String(info.timestamp)} EXCEPTION ${String(info.message)}${stack}\n`;
  }),
);

function getLevelColor(level: string): string {
  switch (level) {
    case 'info':
      return `${escSeq('\x1b[36m')}${escSeq('\x1b[1m')}`;
    case 'warn':
      return `${escSeq('\x1b[33m')}${escSeq('\x1b[1m')}`;
    case 'error':
      return `${escSeq('\x1b[31m')}${escSeq('\x1b[1m')}`;
    case 'debug':
      return `${escSeq('\x1b[35m')}${escSeq('\x1b[2m')}`;
    default:
      return escSeq('\x1b[0m');
  }
}

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: () => new Date().toISOString() }),
  winston.format.printf((info) => {
    const ts = new Date(String(info.timestamp)).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const reset = escSeq('\x1b[0m');
    const dim = escSeq('\x1b[2m');
    const levelColor = getLevelColor(info.level);
    const levelStr = `${levelColor}${String(info.level).toUpperCase().padEnd(5)}${reset}`;
    const messageStr = `${escSeq('\x1b[37m')}${String(info.message)}${reset}`;
    const meta: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(info)) {
      if (key === 'level' || key === 'message' || key === 'timestamp' || key === 'splat') {
        continue;
      }
      meta[key] = value;
    }
    const dataStr = Object.keys(meta).length ? ` ${dim}${stringifyMeta(meta)}${reset}` : '';
    return `${dim}${ts}${reset} ${levelStr} ${messageStr}${dataStr}`;
  }),
);

function normalizeMeta(data: unknown): Record<string, unknown> | undefined {
  if (data === undefined) {
    return undefined;
  }
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return { data };
}

function buildFileTransports(): winston.transport[] {
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  const master = new DailyRotateFile({
    ...rotateFileBase('master'),
    format: plainFileFormat,
    handleExceptions: true,
    handleRejections: true,
  });

  const application = new DailyRotateFile({
    ...rotateFileBase('application'),
    format: winston.format.combine(levelOnly('info'), plainFileFormat),
  });

  const warn = new DailyRotateFile({
    ...rotateFileBase('warn'),
    format: winston.format.combine(levelOnly('warn'), plainFileFormat),
  });

  const error = new DailyRotateFile({
    ...rotateFileBase('error'),
    format: winston.format.combine(levelOnly('error'), plainFileFormat),
  });

  const debug = new DailyRotateFile({
    ...rotateFileBase('debug'),
    format: winston.format.combine(levelOnly('debug'), plainFileFormat),
  });

  return [master, application, warn, error, debug];
}

function buildExceptionFileTransport(): DailyRotateFile {
  return new DailyRotateFile({
    ...rotateFileBase('exception'),
    format: exceptionLineFormat,
  });
}

const consoleLevel =
  process.env.LOG_CONSOLE_LEVEL ||
  (process.env.NODE_ENV === 'development' ? 'debug' : 'info');

const transports: winston.transport[] = [
  new winston.transports.Console({
    level: consoleLevel,
    format: consoleFormat,
  }),
];

const exceptionHandlers: winston.transport[] = [];
const rejectionHandlers: winston.transport[] = [];

if (shouldEnableLogFiles()) {
  transports.push(...buildFileTransports());
  exceptionHandlers.push(buildExceptionFileTransport());
  rejectionHandlers.push(buildExceptionFileTransport());
}

function formatExceptionConsoleLine(info: winston.Logform.TransformableInfo): string {
  const stackPart = typeof info.stack === 'string' ? `\n${info.stack}` : '';
  return `${String(info.message)}${stackPart}`;
}

exceptionHandlers.push(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf((info) => formatExceptionConsoleLine(info)),
    ),
  }),
);
rejectionHandlers.push(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf((info) => formatExceptionConsoleLine(info)),
    ),
  }),
);

/** Root Winston logger: console + daily rotating files under `server/logs`. */
export const rootLogger = winston.createLogger({
  level: 'debug',
  transports,
  exceptionHandlers,
  rejectionHandlers,
  exitOnError: false,
});

export function logInfo(message: string, data?: unknown): void {
  const meta = normalizeMeta(data);
  if (meta) {
    rootLogger.info(message, meta);
  } else {
    rootLogger.info(message);
  }
}

export function logWarn(message: string, data?: unknown): void {
  const meta = normalizeMeta(data);
  if (meta) {
    rootLogger.warn(message, meta);
  } else {
    rootLogger.warn(message);
  }
}

export function logError(message: string, data?: unknown): void {
  const meta = normalizeMeta(data);
  if (meta) {
    rootLogger.error(message, meta);
  } else {
    rootLogger.error(message);
  }
}

export function logDebug(message: string, data?: unknown): void {
  const meta = normalizeMeta(data);
  if (meta) {
    rootLogger.debug(message, meta);
  } else {
    rootLogger.debug(message);
  }
}

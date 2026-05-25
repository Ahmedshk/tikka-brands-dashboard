import {
  flushLogger,
  logDebug,
  logError,
  logInfo,
  logWarn,
} from './pinoLogger.util.js';

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

export const logger = {
  info: (message: string, data?: unknown) => {
    logInfo(message, data);
  },

  warn: (message: string, data?: unknown) => {
    logWarn(message, data);
  },

  error: (message: string, data?: unknown) => {
    logError(message, data);
  },

  debug: (message: string, data?: unknown) => {
    logDebug(message, data);
  },

  /**
   * Resolve when pending log records have been handed off to transport
   * workers. Used by graceful shutdown (SIGTERM/SIGINT) to avoid losing
   * the last few logs in flight before `process.exit`. Safe to call
   * multiple times — pino tolerates concurrent flushes.
   */
  flush: (): Promise<void> => flushLogger(),
};

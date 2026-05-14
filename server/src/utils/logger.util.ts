import { logDebug, logError, logInfo, logWarn } from './winstonLogger.util.js';

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
};

import { escSeq } from './ansiLog.util.js';

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
}

const getLevelColor = (level: LogLevel): string => {
  switch (level) {
    case LogLevel.INFO:
      return `${escSeq('\x1b[36m')}${escSeq('\x1b[1m')}`;
    case LogLevel.WARN:
      return `${escSeq('\x1b[33m')}${escSeq('\x1b[1m')}`;
    case LogLevel.ERROR:
      return `${escSeq('\x1b[31m')}${escSeq('\x1b[1m')}`;
    case LogLevel.DEBUG:
      return `${escSeq('\x1b[35m')}${escSeq('\x1b[2m')}`;
    default:
      return escSeq('\x1b[0m');
  }
};

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${escSeq('\x1b[2m')}${time}${escSeq('\x1b[0m')}`;
};

const formatLog = (entry: LogEntry): string => {
  const { level, message, timestamp, data } = entry;
  const levelColor = getLevelColor(level);
  const formattedTimestamp = formatTimestamp(timestamp);
  const reset = escSeq('\x1b[0m');
  const levelStr = `${levelColor}${level.padEnd(5)}${reset}`;
  const messageStr = `${escSeq('\x1b[37m')}${message}${reset}`;
  const dataStr = data ? ` ${escSeq('\x1b[2m')}${JSON.stringify(data)}${reset}` : '';

  return `${formattedTimestamp} ${levelStr} ${messageStr}${dataStr}`;
};

export const logger = {
  info: (message: string, data?: unknown) => {
    const entry: LogEntry = {
      level: LogLevel.INFO,
      message,
      timestamp: new Date().toISOString(),
      data,
    };
    console.log(formatLog(entry));
  },

  warn: (message: string, data?: unknown) => {
    const entry: LogEntry = {
      level: LogLevel.WARN,
      message,
      timestamp: new Date().toISOString(),
      data,
    };
    console.warn(formatLog(entry));
  },

  error: (message: string, data?: unknown) => {
    const entry: LogEntry = {
      level: LogLevel.ERROR,
      message,
      timestamp: new Date().toISOString(),
      data,
    };
    console.error(formatLog(entry));
  },

  debug: (message: string, data?: unknown) => {
    if (process.env.NODE_ENV === 'development') {
      const entry: LogEntry = {
        level: LogLevel.DEBUG,
        message,
        timestamp: new Date().toISOString(),
        data,
      };
      console.debug(formatLog(entry));
    }
  },
};

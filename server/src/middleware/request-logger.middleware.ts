import { Request, Response, NextFunction } from 'express';
import { escSeq } from '../utils/ansiLog.util.js';

/** Raw ANSI method colors — wrapped with escSeq at log time (not module load). */
const methodAnsi: Record<string, string> = {
  GET: '\x1b[32m',
  POST: '\x1b[34m',
  PUT: '\x1b[33m',
  PATCH: '\x1b[35m',
  DELETE: '\x1b[31m',
  OPTIONS: '\x1b[36m',
  HEAD: '\x1b[37m',
};

const getStatusColor = (status: number): string => {
  if (status >= 200 && status < 300) return escSeq('\x1b[32m');
  if (status >= 300 && status < 400) return escSeq('\x1b[33m');
  if (status >= 400 && status < 500) return escSeq('\x1b[31m');
  if (status >= 500) return `${escSeq('\x1b[31m')}${escSeq('\x1b[1m')}`;
  return escSeq('\x1b[37m');
};

const getDurationColor = (durationMs: number): string => {
  if (durationMs > 1000) return escSeq('\x1b[31m');
  if (durationMs > 500) return escSeq('\x1b[33m');
  return escSeq('\x1b[32m');
};

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  const method = req.method;
  const path = req.path;

  const reset = escSeq('\x1b[0m');
  const dim = escSeq('\x1b[2m');
  const bright = escSeq('\x1b[1m');
  const methodColor = escSeq(methodAnsi[method] ?? '\x1b[37m');

  const timestamp = new Date().toISOString();
  const time = new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  console.log(
    `${dim}${time}${reset} ${methodColor}${bright}${method.padEnd(6)}${reset} ${path}`
  );

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    const statusColor = getStatusColor(status);
    const durationColor = getDurationColor(duration);

    console.log(
      `${dim}${time}${reset} ${methodColor}${bright}${method.padEnd(6)}${reset} ${path} ${statusColor}${status}${reset} ${dim}-${reset} ${durationColor}${duration}ms${reset}`
    );
  });

  next();
};

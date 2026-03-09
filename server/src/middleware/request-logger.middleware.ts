import { Request, Response, NextFunction } from 'express';

// ANSI color codes for HTTP methods
const methodColors: Record<string, string> = {
  GET: '\x1b[32m',      // Green
  POST: '\x1b[34m',     // Blue
  PUT: '\x1b[33m',      // Yellow
  PATCH: '\x1b[35m',    // Magenta
  DELETE: '\x1b[31m',   // Red
  OPTIONS: '\x1b[36m',  // Cyan
  HEAD: '\x1b[37m',     // White
};

const reset = '\x1b[0m';
const dim = '\x1b[2m';
const bright = '\x1b[1m';

const getStatusColor = (status: number): string => {
  if (status >= 200 && status < 300) return '\x1b[32m'; // Green for success
  if (status >= 300 && status < 400) return '\x1b[33m'; // Yellow for redirect
  if (status >= 400 && status < 500) return '\x1b[31m'; // Red for client error
  if (status >= 500) return '\x1b[31m\x1b[1m'; // Bright red for server error
  return '\x1b[37m'; // White for other
};

const getDurationColor = (durationMs: number): string => {
  if (durationMs > 1000) return '\x1b[31m';
  if (durationMs > 500) return '\x1b[33m';
  return '\x1b[32m';
};

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  const method = req.method;
  const path = req.path;
  const methodColor = methodColors[method] || '\x1b[37m';
  
  // Log incoming request
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

  // Log response when it finishes
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

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.util.js';
import { AppError } from '../utils/errors.util.js';

export const errorHandler = (
  err: Error & { code?: string },
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let appError: AppError;
  if (err instanceof AppError) {
    appError = err;
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    appError = new AppError('File too large. Profile image must be 2 MB or less.', 400);
  } else {
    appError = new AppError(err.message || 'Internal server error', 500);
  }
  const statusCode = appError.statusCode || 500;
  const message = appError.message || 'Internal server error';

  logger.error('Error occurred', {
    message,
    statusCode,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

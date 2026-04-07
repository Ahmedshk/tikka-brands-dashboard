import express, { Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/error.middleware.js';
import { requestLogger } from './middleware/request-logger.middleware.js';
import apiRoutes from './routes/api.routes.js';
import indexRoutes from './routes/index.routes.js';
import squareWebhookRoutes from './routes/squareWebhook.routes.js';

const app: Application = express();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
// Square webhooks require raw body for HMAC verification (before express.json)
app.use(
  '/api/webhooks/square',
  express.raw({ type: 'application/json' }),
  squareWebhookRoutes,
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

// Request logging middleware (always enabled)
app.use(requestLogger);

// Routes
app.use('/api', apiRoutes);
app.use('/', indexRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;

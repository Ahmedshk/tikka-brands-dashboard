import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import http from 'node:http';
import app from './app.js';
import { connectDatabase } from './config/database.js';
import { initializeCloudinary } from './config/cloudinary.js';
import { initializeNodemailer } from './config/nodemailer.js';
import { initializeSocket } from './config/socket.js';
import { initializeAgenda, shutdownAgenda } from './config/agenda.js';
import { RoleService } from './services/role.service.js';
import { ReviewCycleService } from './services/reviewCycle.service.js';
import { logger } from './utils/logger.util.js';

// Load environment variables from server directory (so correct .env is used regardless of cwd)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PORT = process.env.PORT || 5000;

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();
    initializeCloudinary();
    initializeNodemailer();
    // Ensure Owner (system) role exists
    const roleService = new RoleService();
    await roleService.ensureOwnerRoleExists();

    const reviewCycleService = new ReviewCycleService();
    const expiredTokenSuperseded = await reviewCycleService.supersedeCyclesWithExpiredSelfReviewTokenAtStartup();
    logger.info('Review cycle startup repair (expired self-review token)', expiredTokenSuperseded);
    const pastScheduledNextSuperseded = await reviewCycleService.supersedeCyclesPastScheduledNextAtStartup();
    logger.info('Review cycle startup repair (past scheduled next reference)', pastScheduledNextSuperseded);
    const missingCycleRepair = await reviewCycleService.repairMissingCycleChainAtStartup();
    logger.info('Review cycle startup repair (missing cycle chain)', missingCycleRepair);

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Initialize Socket.io for real-time notifications
    initializeSocket(httpServer);

    // Initialize Agenda.js scheduler
    await initializeAgenda();

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      await shutdownAgenda();
      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Failed to start server', error instanceof Error ? { message: error.message, stack: error.stack } : error);
    process.exit(1);
  }
};

startServer();

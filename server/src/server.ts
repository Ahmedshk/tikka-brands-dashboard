import dotenv from 'dotenv';
import http from 'node:http';
import app from './app.js';
import { connectDatabase } from './config/database.js';
import { initializeCloudinary } from './config/cloudinary.js';
import { initializeNodemailer } from './config/nodemailer.js';
import { RoleService } from './services/role.service.js';
import { logger } from './utils/logger.util.js';

// Load environment variables
dotenv.config();

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

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

startServer();

const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const db = require('./config/database');
const whatsappService = require('./services/notification/whatsapp.service');

const startServer = async () => {
  try {
    // Test DB connection
    await db.raw('SELECT 1');
    logger.info(`Database connected successfully via ${env.DB_CONNECTION.toUpperCase()}`);

    const server = app.listen(env.PORT, () => {
      logger.info(`=======================================================`);
      logger.info(`  ${env.APP_NAME} is running!`);
      logger.info(`  URL: http://localhost:${env.PORT}`);
      logger.info(`  Environment: ${env.NODE_ENV}`);
      logger.info(`  Database: ${env.DB_CONNECTION}`);
      logger.info(`=======================================================`);
    });

    // Retry failed WhatsApp deliveries only when a real provider exists.
    whatsappService.startQueueWorker();

    // Graceful shutdown handling
    const shutdown = () => {
      logger.info('Shutting down server gracefully...');
      whatsappService.stopQueueWorker();
      server.close(() => {
        logger.info('HTTP server closed.');
        db.destroy(() => {
          logger.info('Database connection pool closed.');
          process.exit(0);
        });
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start server: ' + error.message, { stack: error.stack });
    process.exit(1);
  }
};

startServer();

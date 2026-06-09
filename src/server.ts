import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { connectDB, disconnectDB } from './config/db';
import { startFacebookTokenRefreshJob } from './modules/facebook-accounts/facebook-token-refresh.job';
import { startInstagramTokenRefreshJob } from './modules/instagram-accounts/instagram-token-refresh.job';

/** Khởi động: kết nối MongoDB trước rồi mới mở HTTP server (fail-fast nếu DB lỗi). */
const start = async (): Promise<void> => {
  await connectDB();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 Server listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  // Tự gia hạn long-lived token Facebook/Instagram định kỳ (không chặn khởi động, không crash).
  startFacebookTokenRefreshJob();
  startInstagramTokenRefreshJob();

  /** Graceful shutdown — đóng HTTP server & ngắt kết nối MongoDB đúng cách. */
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down...`);
    server.close(() => logger.info('HTTP server closed'));
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
};

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception');
  process.exit(1);
});

void start().catch((err) => {
  logger.fatal({ err }, 'Không thể khởi động server');
  process.exit(1);
});

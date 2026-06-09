import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Kết nối MongoDB qua Mongoose (ODM duy nhất của dự án). Models nằm ở src/models.
 */
mongoose.set('strictQuery', true);

let connected = false;

/** Mở kết nối (gọi 1 lần lúc khởi động). Fail-fast nếu DB không sẵn sàng. */
export const connectDB = async (): Promise<void> => {
  if (connected) return;

  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection error');
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  await mongoose.connect(env.DATABASE_URL);
  connected = true;
  logger.info('✅ MongoDB connected');
};

/** Đóng kết nối khi shutdown. */
export const disconnectDB = async (): Promise<void> => {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
  logger.info('MongoDB connection closed');
};

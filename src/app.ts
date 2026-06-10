import './types/express.d'; // load global type augmentation
import path from 'path';
import express, { type Application, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './utils/logger';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { globalRateLimiter } from './middlewares/rateLimiter';

export const createApp = (): Application => {
  const app = express();

  // --- Security & infra middlewares ---
  // crossOriginResourcePolicy = cross-origin để FE (origin khác) tải được ảnh/video
  // tĩnh trong /uploads (preview bài đăng).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));
  app.use(globalRateLimiter);

  // --- Static: ảnh/video người dùng upload cho bài đăng Facebook ---
  app.use('/uploads', express.static(path.resolve('uploads')));

  // --- Health check ---
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'success', message: 'OK' });
  });

  // --- API routes ---
  app.use('/api/v1', apiRouter);

  // --- 404 + global error handler (luôn đặt cuối cùng) ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

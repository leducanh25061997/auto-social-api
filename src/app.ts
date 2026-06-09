import './types/express.d'; // load global type augmentation
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
  app.use(helmet());
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

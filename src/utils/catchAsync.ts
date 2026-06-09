import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Bọc một async controller để tự động forward error sang global error handler.
 * Tránh phải viết try/catch lặp lại ở mỗi controller.
 */
type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export const catchAsync =
  (fn: AsyncHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

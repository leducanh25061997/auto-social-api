import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';

/**
 * Yêu cầu Bearer access token hợp lệ. Gắn payload vào req.user.
 */
export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }
  const token = header.slice('Bearer '.length).trim();
  req.user = verifyAccessToken(token);
  next();
};

/**
 * Giới hạn theo role. Dùng SAU requireAuth.
 */
export const requireRole =
  (...roles: Array<'USER' | 'ADMIN'>) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) throw ApiError.forbidden('Insufficient permissions');
    next();
  };

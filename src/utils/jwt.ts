import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from './ApiError';

export interface JwtPayload {
  sub: string; // user id
  role: 'USER' | 'ADMIN';
}

export const signAccessToken = (payload: JwtPayload): string =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);

export const signRefreshToken = (payload: JwtPayload): string =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);

export const verifyAccessToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
};

/** Đọc thời điểm hết hạn (exp) của token để lưu vào DB. */
export const getTokenExpiry = (token: string): Date => {
  const decoded = jwt.decode(token);
  if (decoded && typeof decoded === 'object' && typeof decoded.exp === 'number') {
    return new Date(decoded.exp * 1000);
  }
  throw new ApiError(500, 'Cannot read token expiry');
};

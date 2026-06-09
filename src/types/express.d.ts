import type { JwtPayload } from '../utils/jwt';

/**
 * Mở rộng Express.Request để mang thông tin user đã xác thực.
 * Type-safe: req.user có kiểu rõ ràng thay vì any.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export {};

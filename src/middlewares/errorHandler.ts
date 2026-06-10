import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { MulterError } from 'multer';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { env } from '../config/env';

interface ErrorResponse {
  status: 'error' | 'fail';
  message: string;
  errors?: unknown;
  stack?: string;
}

/** Lỗi trùng khoá của MongoDB (unique index) — không phải subclass mongoose.Error. */
interface MongoDuplicateKeyError {
  code: number;
  keyValue?: Record<string, unknown>;
}
const isDuplicateKeyError = (err: unknown): err is MongoDuplicateKeyError =>
  typeof err === 'object' &&
  err !== null &&
  (err as { code?: number }).code === 11000;

/** Tên trường kỹ thuật -> nhãn tiếng Việt dễ hiểu cho người dùng cuối. */
const FIELD_LABELS: Record<string, string> = {
  username: 'Tên đăng nhập',
  email: 'Email',
  tokenHash: 'Phiên đăng nhập',
};
const labelFor = (field: string): string => FIELD_LABELS[field] ?? field;

/** 404 cho route không khớp. */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

/**
 * Global Error Handler — bắt mọi exception và trả format chuẩn { status, message, errors }.
 */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.details;
  } else if (isDuplicateKeyError(err)) {
    // Trùng giá trị unique (vd: tên đăng nhập/email đã tồn tại).
    statusCode = 409;
    const fields = Object.keys(err.keyValue ?? {}).map(labelFor).join(', ');
    message = fields ? `${fields} đã được sử dụng, vui lòng chọn giá trị khác` : 'Dữ liệu đã tồn tại';
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Dữ liệu không hợp lệ, vui lòng kiểm tra lại';
    errors = Object.values(err.errors).map((e) => e.message);
  } else if (err instanceof mongoose.Error.CastError) {
    // Vd: id sai định dạng -> với người dùng là "không tìm thấy".
    statusCode = 404;
    message = 'Không tìm thấy dữ liệu yêu cầu';
  } else if (err instanceof MulterError) {
    // Lỗi upload (file quá lớn, quá nhiều file...) -> thông báo thân thiện.
    statusCode = 400;
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Tệp tải lên quá lớn. Vui lòng chọn tệp nhỏ hơn.'
        : 'Tải tệp lên thất bại. Vui lòng thử lại.';
  } else if (err instanceof Error) {
    message = env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
  }

  // Lỗi không lường trước -> log đầy đủ để debug.
  if (statusCode >= 500) {
    logger.error({ err }, 'Unhandled error');
  }

  const body: ErrorResponse = {
    status: statusCode >= 500 ? 'error' : 'fail',
    message,
  };
  if (errors !== undefined) body.errors = errors;
  if (env.NODE_ENV !== 'production' && err instanceof Error && err.stack) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
};

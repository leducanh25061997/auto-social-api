import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { ApiError } from '../utils/ApiError';

export interface RequestSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Middleware validate request bằng Zod TRƯỚC khi vào controller.
 * Ghi đè req.body/query/params bằng dữ liệu đã được parse & coerce.
 */
export const validate =
  (schemas: RequestSchemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query));
      if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params));
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(ApiError.badRequest('Validation failed', formatZodError(err)));
        return;
      }
      next(err);
    }
  };

const formatZodError = (err: ZodError): Record<string, string[]> => {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const path = issue.path.join('.') || '_';
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return fieldErrors;
};

/** Helper suy luận type của body sau khi validate. */
export type InferBody<T extends ZodTypeAny> = z.infer<T>;

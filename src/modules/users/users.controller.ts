import type { Request, Response } from 'express';
import { usersService } from './users.service';
import { catchAsync } from '../../utils/catchAsync';
import { ApiError } from '../../utils/ApiError';
import type {
  CreateUserInput,
  ListUsersQuery,
  ResetPasswordInput,
  UpdateUserInput,
  UserIdParam,
} from './users.schema';

/** id luôn tồn tại sau middleware validate(params); lấy type-safe qua schema. */
const getId = (req: Request): string => (req.params as UserIdParam).id;

/**
 * Controller chỉ điều phối: nhận request (đã validate), gọi service, trả response.
 * Mọi response bọc trong envelope chuẩn { status, data, message? }.
 */
export const usersController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const result = await usersService.list(req.query as unknown as ListUsersQuery);
    res.status(200).json({ status: 'success', data: result });
  }),

  getById: catchAsync(async (req: Request, res: Response) => {
    const user = await usersService.getById(getId(req));
    res.status(200).json({ status: 'success', data: { user } });
  }),

  create: catchAsync(async (req: Request, res: Response) => {
    const user = await usersService.create(req.body as CreateUserInput);
    res.status(201).json({ status: 'success', data: { user } });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const user = await usersService.update(getId(req), req.body as UpdateUserInput);
    res.status(200).json({ status: 'success', data: { user } });
  }),

  remove: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    await usersService.remove(getId(req), req.user.sub);
    res.status(200).json({ status: 'success', message: 'Đã xoá người dùng' });
  }),

  resetPassword: catchAsync(async (req: Request, res: Response) => {
    const { password } = req.body as ResetPasswordInput;
    await usersService.resetPassword(getId(req), password);
    res.status(200).json({ status: 'success', message: 'Đã đặt lại mật khẩu' });
  }),
};

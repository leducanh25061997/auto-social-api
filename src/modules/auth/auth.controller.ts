import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { catchAsync } from '../../utils/catchAsync';
import { ApiError } from '../../utils/ApiError';
import type {
  ChangePasswordInput,
  LoginInput,
  RefreshInput,
  RegisterInput,
  UpdateMeInput,
} from './auth.schema';

/**
 * Controller chỉ điều phối: nhận request (đã validate), gọi service, trả response.
 * KHÔNG chứa business logic.
 */
export const authController = {
  register: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.register(req.body as RegisterInput);
    res.status(201).json({ status: 'success', data: result });
  }),

  login: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.login(req.body as LoginInput);
    res.status(200).json({ status: 'success', data: result });
  }),

  refresh: catchAsync(async (req: Request, res: Response) => {
    const tokens = await authService.refresh(req.body as RefreshInput);
    res.status(200).json({ status: 'success', data: tokens });
  }),

  logout: catchAsync(async (req: Request, res: Response) => {
    await authService.logout(req.body as RefreshInput);
    res.status(200).json({ status: 'success', message: 'Đã đăng xuất' });
  }),

  me: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const user = await authService.me(req.user.sub);
    res.status(200).json({ status: 'success', data: { user } });
  }),

  updateMe: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const user = await authService.updateMe(req.user.sub, req.body as UpdateMeInput);
    res.status(200).json({ status: 'success', data: { user } });
  }),

  changePassword: catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    await authService.changePassword(req.user.sub, req.body as ChangePasswordInput);
    res.status(200).json({ status: 'success', message: 'Đã đổi mật khẩu' });
  }),
};

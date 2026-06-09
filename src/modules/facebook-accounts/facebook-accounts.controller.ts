import type { Request, Response } from 'express';

import { facebookAccountsService } from './facebook-accounts.service';
import { catchAsync } from '../../utils/catchAsync';
import type {
  ConnectFacebookInput,
  ExchangeFacebookInput,
  FacebookAccountIdParam,
  ListFacebookAccountsQuery,
  UpdateFacebookAccountInput,
} from './facebook-accounts.schema';

/** id luôn tồn tại sau middleware validate(params). */
const getId = (req: Request): string => (req.params as FacebookAccountIdParam).id;

/**
 * Controller chỉ điều phối: nhận request (đã validate), gọi service, trả response.
 * Mọi response bọc envelope chuẩn { status, data, message? }.
 */
export const facebookAccountsController = {
  exchange: catchAsync(async (req: Request, res: Response) => {
    const preview = await facebookAccountsService.exchange(
      req.body as ExchangeFacebookInput,
    );
    res.status(200).json({ status: 'success', data: { preview } });
  }),

  connect: catchAsync(async (req: Request, res: Response) => {
    const account = await facebookAccountsService.connect(
      req.body as ConnectFacebookInput,
    );
    res.status(201).json({ status: 'success', data: { account } });
  }),

  list: catchAsync(async (req: Request, res: Response) => {
    const result = await facebookAccountsService.list(
      req.query as unknown as ListFacebookAccountsQuery,
    );
    res.status(200).json({ status: 'success', data: result });
  }),

  getById: catchAsync(async (req: Request, res: Response) => {
    const account = await facebookAccountsService.getById(getId(req));
    res.status(200).json({ status: 'success', data: { account } });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const account = await facebookAccountsService.update(
      getId(req),
      req.body as UpdateFacebookAccountInput,
    );
    res.status(200).json({ status: 'success', data: { account } });
  }),

  remove: catchAsync(async (req: Request, res: Response) => {
    await facebookAccountsService.remove(getId(req));
    res.status(200).json({ status: 'success', message: 'Đã xoá tài khoản Facebook' });
  }),

  listPages: catchAsync(async (req: Request, res: Response) => {
    const pages = await facebookAccountsService.listPages(getId(req));
    res.status(200).json({ status: 'success', data: { pages } });
  }),

  refresh: catchAsync(async (req: Request, res: Response) => {
    const account = await facebookAccountsService.refresh(getId(req));
    res.status(200).json({ status: 'success', data: { account } });
  }),
};

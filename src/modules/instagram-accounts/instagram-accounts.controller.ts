import type { Request, Response } from 'express';

import { instagramAccountsService } from './instagram-accounts.service';
import { catchAsync } from '../../utils/catchAsync';
import type {
  ConnectInstagramInput,
  ExchangeInstagramInput,
  InstagramAccountIdParam,
  ListInstagramAccountsQuery,
  UpdateInstagramAccountInput,
} from './instagram-accounts.schema';

const getId = (req: Request): string => (req.params as InstagramAccountIdParam).id;

/** Controller chỉ điều phối: nhận request (đã validate), gọi service, trả response. */
export const instagramAccountsController = {
  exchange: catchAsync(async (req: Request, res: Response) => {
    const preview = await instagramAccountsService.exchange(
      req.body as ExchangeInstagramInput,
    );
    res.status(200).json({ status: 'success', data: { preview } });
  }),

  connect: catchAsync(async (req: Request, res: Response) => {
    const account = await instagramAccountsService.connect(
      req.body as ConnectInstagramInput,
    );
    res.status(201).json({ status: 'success', data: { account } });
  }),

  list: catchAsync(async (req: Request, res: Response) => {
    const result = await instagramAccountsService.list(
      req.query as unknown as ListInstagramAccountsQuery,
    );
    res.status(200).json({ status: 'success', data: result });
  }),

  getById: catchAsync(async (req: Request, res: Response) => {
    const account = await instagramAccountsService.getById(getId(req));
    res.status(200).json({ status: 'success', data: { account } });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const account = await instagramAccountsService.update(
      getId(req),
      req.body as UpdateInstagramAccountInput,
    );
    res.status(200).json({ status: 'success', data: { account } });
  }),

  remove: catchAsync(async (req: Request, res: Response) => {
    await instagramAccountsService.remove(getId(req));
    res.status(200).json({ status: 'success', message: 'Đã xoá tài khoản Instagram' });
  }),

  refresh: catchAsync(async (req: Request, res: Response) => {
    const account = await instagramAccountsService.refresh(getId(req));
    res.status(200).json({ status: 'success', data: { account } });
  }),
};

import type { Request, Response } from 'express';

import { facebookPagePostsService } from './facebook-page-posts.service';
import { buildPublicUrl, compressImage } from './facebook-uploads';
import { catchAsync } from '../../utils/catchAsync';
import { ApiError } from '../../utils/ApiError';
import type {
  CreateFacebookPostInput,
  DeleteFacebookPostInput,
  FacebookPostIdParam,
  GenerateCommentInput,
  ListFacebookPostsQuery,
  RescheduleFacebookPostInput,
  UpdateFacebookPostInput,
} from './facebook-page-posts.schema';

const getId = (req: Request): string => (req.params as FacebookPostIdParam).id;

const normalizePath = (p: string): string => p.replace(/\\/g, '/');

/** Controller chỉ điều phối; mọi response bọc envelope { status, data }. */
export const facebookPagePostsController = {
  create: catchAsync(async (req: Request, res: Response) => {
    const post = await facebookPagePostsService.create(req.body as CreateFacebookPostInput);
    res.status(201).json({ status: 'success', data: { post } });
  }),

  list: catchAsync(async (req: Request, res: Response) => {
    const result = await facebookPagePostsService.list(
      req.query as unknown as ListFacebookPostsQuery,
    );
    res.status(200).json({ status: 'success', data: result });
  }),

  getById: catchAsync(async (req: Request, res: Response) => {
    const post = await facebookPagePostsService.getById(getId(req));
    res.status(200).json({ status: 'success', data: { post } });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const post = await facebookPagePostsService.update(
      getId(req),
      req.body as UpdateFacebookPostInput,
    );
    res.status(200).json({ status: 'success', data: { post } });
  }),

  publish: catchAsync(async (req: Request, res: Response) => {
    const post = await facebookPagePostsService.publishNow(getId(req));
    res.status(200).json({ status: 'success', data: { post } });
  }),

  reschedule: catchAsync(async (req: Request, res: Response) => {
    const { scheduledAt } = req.body as RescheduleFacebookPostInput;
    const post = await facebookPagePostsService.reschedule(getId(req), scheduledAt);
    res.status(200).json({ status: 'success', data: { post } });
  }),

  cancelSchedule: catchAsync(async (req: Request, res: Response) => {
    const post = await facebookPagePostsService.cancelSchedule(getId(req));
    res.status(200).json({ status: 'success', data: { post } });
  }),

  remove: catchAsync(async (req: Request, res: Response) => {
    const { deleteOnFacebook } = (req.body ?? {}) as DeleteFacebookPostInput;
    await facebookPagePostsService.remove(getId(req), Boolean(deleteOnFacebook));
    res.status(200).json({ status: 'success', message: 'Đã xoá bài đăng' });
  }),

  /** Gợi ý nội dung comment đầu tiên bằng AI dựa trên nội dung bài. */
  generateComment: catchAsync(async (req: Request, res: Response) => {
    const { message, pageName } = req.body as GenerateCommentInput;
    const comment = await facebookPagePostsService.generateComment({
      message,
      ...(pageName ? { pageName } : {}),
    });
    res.status(200).json({ status: 'success', data: { comment } });
  }),

  /** Upload nhiều ảnh (đã qua multer ở routes). Nén rồi trả path + url công khai. */
  uploadImages: catchAsync(async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw ApiError.badRequest('Vui lòng chọn ít nhất 1 ảnh.');
    const images = [];
    for (const file of files) {
      const imagePath = await compressImage(normalizePath(file.path));
      images.push({ imagePath, imageUrl: buildPublicUrl(imagePath) });
    }
    res.status(200).json({ status: 'success', data: { images } });
  }),

  /** Upload 1 video (đã qua multer ở routes). */
  uploadVideo: catchAsync(async (req: Request, res: Response) => {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) throw ApiError.badRequest('Vui lòng chọn một video.');
    const videoPath = normalizePath(file.path);
    res.status(200).json({
      status: 'success',
      data: { videoPath, videoUrl: buildPublicUrl(videoPath) },
    });
  }),
};

import { z } from 'zod';

/** 1 ảnh đính kèm (đã upload qua /upload-images). */
const postImageSchema = z.object({
  imagePath: z.string().trim().default(''),
  imageUrl: z.string().trim().default(''),
});

/** Tạo bài đăng. `publishNow` và `scheduledAt` loại trừ nhau. */
export const createFacebookPostSchema = z
  .object({
    facebookAccountId: z.string().min(1, 'Thiếu tài khoản Facebook'),
    pageId: z.string().min(1, 'Thiếu Page để đăng'),
    pageName: z.string().trim().max(200).optional(),
    postType: z.enum(['feed', 'reel']).default('feed'),
    message: z.string().max(5000).optional(),
    firstComment: z.string().max(5000).optional(),
    images: z.array(postImageSchema).max(10).optional(),
    videoPath: z.string().trim().optional(),
    videoUrl: z.string().trim().optional(),
    publishNow: z.boolean().optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    timezone: z.string().trim().max(64).optional(),
  })
  .refine((d) => !(d.publishNow && d.scheduledAt), {
    message: 'Không thể vừa đăng ngay vừa lên lịch',
    path: ['scheduledAt'],
  });

/** Cập nhật bài (chỉ khi draft/scheduled/failed). Gửi scheduledAt=null để huỷ lịch. */
export const updateFacebookPostSchema = z.object({
  pageId: z.string().min(1).optional(),
  pageName: z.string().trim().max(200).optional(),
  postType: z.enum(['feed', 'reel']).optional(),
  message: z.string().max(5000).optional(),
  firstComment: z.string().max(5000).optional(),
  images: z.array(postImageSchema).max(10).optional(),
  videoPath: z.string().trim().optional(),
  videoUrl: z.string().trim().optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().trim().max(64).optional(),
});

/** Đổi lịch đăng. */
export const rescheduleFacebookPostSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }),
});

/** Xoá bài — tuỳ chọn xoá luôn trên Facebook. */
export const deleteFacebookPostSchema = z.object({
  deleteOnFacebook: z.boolean().optional(),
});

/** Query danh sách + lọc. */
export const listFacebookPostsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(200).optional(),
  status: z.enum(['draft', 'scheduled', 'processing', 'published', 'failed']).optional(),
  facebookAccountId: z.string().optional(),
  pageId: z.string().optional(),
});

export const facebookPostIdParamSchema = z.object({
  id: z.string().min(1),
});

/** Gợi ý nội dung comment đầu tiên bằng AI dựa trên nội dung bài. */
export const generateCommentSchema = z.object({
  message: z.string().trim().min(1, 'Cần nội dung bài viết để AI gợi ý').max(5000),
  pageName: z.string().trim().max(200).optional(),
});

export type CreateFacebookPostInput = z.infer<typeof createFacebookPostSchema>;
export type UpdateFacebookPostInput = z.infer<typeof updateFacebookPostSchema>;
export type RescheduleFacebookPostInput = z.infer<typeof rescheduleFacebookPostSchema>;
export type DeleteFacebookPostInput = z.infer<typeof deleteFacebookPostSchema>;
export type ListFacebookPostsQuery = z.infer<typeof listFacebookPostsSchema>;
export type FacebookPostIdParam = z.infer<typeof facebookPostIdParamSchema>;
export type GenerateCommentInput = z.infer<typeof generateCommentSchema>;

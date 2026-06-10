import { existsSync } from 'fs';
import path from 'path';

import { facebookPagePostsRepository } from './facebook-page-posts.repository';
import {
  commentOnFacebookPost,
  deletePostOnFacebook,
  publishToFacebookPage,
  publishToFacebookReel,
} from './facebook-publish';
import { generateFirstComment } from './openai-comment';
import { facebookAccountsRepository } from '../facebook-accounts/facebook-accounts.repository';
import {
  assertFacebookConfigured,
  getPagesWithToken,
  isFacebookConfigured,
} from '../facebook-accounts/facebook-graph';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';
import type {
  FacebookPagePost,
  FacebookPagePostImage,
} from '../../models/types';
import type {
  CreateFacebookPostInput,
  ListFacebookPostsQuery,
  UpdateFacebookPostInput,
} from './facebook-page-posts.schema';

const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000; // 5 phút
const MAX_RETRY = 3;
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

export interface PaginatedFacebookPosts {
  items: FacebookPagePost[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Validate + parse scheduledAt; ném lỗi tiếng Việt nếu không hợp lệ. */
const parseScheduledAt = (input: string): Date => {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw ApiError.badRequest('Thời gian lên lịch không hợp lệ');
  }
  if (d.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
    throw ApiError.badRequest('Thời gian đăng phải cách hiện tại ít nhất 5 phút');
  }
  return d;
};

/** Chuẩn hoá danh sách ảnh feed (bỏ ảnh rỗng, tối đa 10). */
const normalizeImages = (images?: FacebookPagePostImage[]): FacebookPagePostImage[] =>
  (images ?? [])
    .filter((i) => i && (i.imagePath || i.imageUrl))
    .map((i) => ({ imagePath: i.imagePath || '', imageUrl: i.imageUrl || '' }))
    .slice(0, 10);

/**
 * Pipeline đăng 1 bài: lấy tài khoản → tìm Page (kèm token) → đăng → cập nhật.
 * Trả về bài đã cập nhật (status=published). Ném ApiError nếu lỗi.
 */
const publishPost = async (post: FacebookPagePost): Promise<FacebookPagePost> => {
  // Ưu tiên tìm theo fbUserId (sống sót qua delete+reconnect); fallback theo id.
  let account = post.fbUserId
    ? await facebookAccountsRepository.findByFbUserId(post.fbUserId)
    : null;
  if (!account) account = await facebookAccountsRepository.findById(post.facebookAccountId);
  if (!account) {
    throw ApiError.badRequest('Không tìm thấy tài khoản Facebook của bài đăng.');
  }
  if (!account.isActive) {
    throw ApiError.badRequest('Tài khoản Facebook đang tạm dừng. Hãy bật lại để đăng bài.');
  }

  const pages = await getPagesWithToken(account.accessToken);
  const target = pages.find((p) => p.id === post.pageId);
  if (!target || !target.accessToken) {
    throw ApiError.badRequest(
      'Không tìm thấy Page hoặc tài khoản không còn quyền quản trị Page này.',
    );
  }

  const result =
    post.postType === 'reel'
      ? await publishToFacebookReel({
          pageId: target.id,
          pageAccessToken: target.accessToken,
          description: post.message,
          videoUrl: post.videoUrl || '',
          videoFilePath:
            !post.videoUrl && post.videoPath
              ? (() => {
                  const abs = path.resolve(post.videoPath.replace(/^\.?\//, ''));
                  return existsSync(abs) ? abs : '';
                })()
              : '',
        })
      : await publishToFacebookPage({
          pageId: target.id,
          pageAccessToken: target.accessToken,
          message: post.message,
          images: post.images,
        });

  // Đăng comment đầu tiên dưới bài (best-effort — không làm hỏng bài đã publish).
  if (post.firstComment?.trim() && result.postId) {
    await commentOnFacebookPost({
      postId: result.postId,
      pageAccessToken: target.accessToken,
      message: post.firstComment,
    });
  }

  return facebookPagePostsRepository.update(post.id, {
    pageName: post.pageName || target.name,
    status: 'published',
    postId: result.postId,
    permalinkUrl: result.permalinkUrl,
    publishedAt: new Date(),
    scheduledAt: null, // bài đã đăng thì bỏ giờ lịch (vd đăng ngay 1 bài đã lên lịch)
    errorMessage: '',
  });
};

export const facebookPagePostsService = {
  async create(input: CreateFacebookPostInput): Promise<FacebookPagePost> {
    assertFacebookConfigured();

    const account = await facebookAccountsRepository.findById(input.facebookAccountId);
    if (!account) throw ApiError.notFound('Không tìm thấy tài khoản Facebook');

    const type = input.postType;
    const images = type === 'reel' ? [] : normalizeImages(input.images);

    if (type === 'reel') {
      if (!input.videoPath && !input.videoUrl) {
        throw ApiError.badRequest('Reel cần một video (tải lên hoặc URL).');
      }
    } else if (!input.message?.trim() && images.length === 0) {
      throw ApiError.badRequest('Bài viết cần ít nhất nội dung hoặc 1 ảnh.');
    }

    const scheduledAt = input.scheduledAt ? parseScheduledAt(input.scheduledAt) : null;

    const created = await facebookPagePostsRepository.create({
      facebookAccountId: account.id,
      fbUserId: account.fbUserId,
      pageId: input.pageId,
      pageName: input.pageName ?? '',
      postType: type,
      message: input.message ?? '',
      firstComment: input.firstComment ?? '',
      images,
      videoPath: type === 'reel' ? input.videoPath ?? '' : '',
      videoUrl: type === 'reel' ? input.videoUrl ?? '' : '',
      status: scheduledAt ? 'scheduled' : 'draft',
      scheduledAt,
      timezone: input.timezone ?? 'Asia/Ho_Chi_Minh',
    });

    // Lên lịch hoặc lưu nháp → trả luôn, không đăng.
    if (scheduledAt || !input.publishNow) return created;

    // Đăng ngay.
    try {
      return await publishPost(created);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Đăng bài thất bại';
      await facebookPagePostsRepository.update(created.id, {
        status: 'failed',
        errorMessage: message,
      });
      throw err;
    }
  },

  async list(query: ListFacebookPostsQuery): Promise<PaginatedFacebookPosts> {
    const { items, total } = await facebookPagePostsRepository.list(query);
    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  },

  async getById(id: string): Promise<FacebookPagePost> {
    const post = await facebookPagePostsRepository.findById(id);
    if (!post) throw ApiError.notFound('Không tìm thấy bài đăng');
    return post;
  },

  async update(id: string, input: UpdateFacebookPostInput): Promise<FacebookPagePost> {
    const post = await facebookPagePostsRepository.findById(id);
    if (!post) throw ApiError.notFound('Không tìm thấy bài đăng');
    if (post.status === 'published') {
      throw ApiError.badRequest('Bài đã đăng không thể chỉnh sửa.');
    }
    if (post.status === 'processing') {
      throw ApiError.badRequest('Bài đang được hệ thống đăng, vui lòng đợi.');
    }

    const type = input.postType ?? post.postType;
    const data: Parameters<typeof facebookPagePostsRepository.update>[1] = {
      postType: type,
      errorMessage: '',
    };
    if (input.message !== undefined) data.message = input.message;
    if (input.firstComment !== undefined) data.firstComment = input.firstComment;
    if (input.pageId) data.pageId = input.pageId;
    if (input.pageName !== undefined) data.pageName = input.pageName;
    if (input.timezone) data.timezone = input.timezone;

    if (type === 'reel') {
      data.images = [];
      if (input.videoPath !== undefined) data.videoPath = input.videoPath;
      if (input.videoUrl !== undefined) data.videoUrl = input.videoUrl;
    } else {
      data.images = normalizeImages(input.images ?? post.images);
      data.videoPath = '';
      data.videoUrl = '';
    }

    // scheduledAt: null/'' → huỷ lịch về draft; có giá trị → scheduled.
    if (input.scheduledAt === null || input.scheduledAt === '') {
      data.scheduledAt = null;
      data.status = 'draft';
    } else if (input.scheduledAt) {
      data.scheduledAt = parseScheduledAt(input.scheduledAt);
      data.status = 'scheduled';
    } else if (post.status === 'failed') {
      data.status = 'draft'; // sửa lại bài lỗi → quay về nháp
    }

    return facebookPagePostsRepository.update(id, data);
  },

  async publishNow(id: string): Promise<FacebookPagePost> {
    assertFacebookConfigured();
    const post = await facebookPagePostsRepository.findById(id);
    if (!post) throw ApiError.notFound('Không tìm thấy bài đăng');
    if (post.status === 'published') throw ApiError.badRequest('Bài này đã được đăng.');
    if (post.status === 'processing') {
      throw ApiError.badRequest('Bài đang được hệ thống xử lý, vui lòng đợi.');
    }

    try {
      const published = await publishPost({ ...post, scheduledAt: null });
      return published;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Đăng bài thất bại';
      await facebookPagePostsRepository.update(id, { status: 'failed', errorMessage: message });
      throw err;
    }
  },

  async reschedule(id: string, scheduledAt: string): Promise<FacebookPagePost> {
    const post = await facebookPagePostsRepository.findById(id);
    if (!post) throw ApiError.notFound('Không tìm thấy bài đăng');
    if (!['scheduled', 'draft', 'failed'].includes(post.status)) {
      throw ApiError.badRequest('Chỉ đổi lịch được khi bài ở trạng thái nháp / đã lên lịch / thất bại.');
    }
    return facebookPagePostsRepository.update(id, {
      scheduledAt: parseScheduledAt(scheduledAt),
      status: 'scheduled',
      errorMessage: '',
    });
  },

  async cancelSchedule(id: string): Promise<FacebookPagePost> {
    const post = await facebookPagePostsRepository.findById(id);
    if (!post) throw ApiError.notFound('Không tìm thấy bài đăng');
    if (post.status !== 'scheduled') throw ApiError.badRequest('Bài này chưa được lên lịch.');
    return facebookPagePostsRepository.update(id, { status: 'draft', scheduledAt: null });
  },

  async remove(id: string, deleteOnFacebook = false): Promise<void> {
    const post = await facebookPagePostsRepository.findById(id);
    if (!post) throw ApiError.notFound('Không tìm thấy bài đăng');

    if (deleteOnFacebook && post.postId) {
      const account = post.fbUserId
        ? (await facebookAccountsRepository.findByFbUserId(post.fbUserId)) ??
          (await facebookAccountsRepository.findById(post.facebookAccountId))
        : await facebookAccountsRepository.findById(post.facebookAccountId);
      if (account) {
        try {
          const pages = await getPagesWithToken(account.accessToken);
          const target = pages.find((p) => p.id === post.pageId);
          if (target?.accessToken) {
            await deletePostOnFacebook(post.postId, target.accessToken);
          }
        } catch (err) {
          logger.warn({ err, id }, 'Xoá bài trên Facebook thất bại (vẫn xoá local)');
        }
      }
    }

    await facebookPagePostsRepository.delete(id);
  },

  /** Gợi ý nội dung comment đầu tiên bằng AI dựa trên nội dung bài. */
  generateComment(input: { message: string; pageName?: string }): Promise<string> {
    return generateFirstComment(input);
  },

  countScheduledByAccount(facebookAccountId: string): Promise<number> {
    return facebookPagePostsRepository.countScheduledByAccount(facebookAccountId);
  },

  /**
   * Cron entrypoint (chạy mỗi phút): khôi phục bài kẹt + đăng các bài tới giờ.
   * Bọc try/catch từng bài, KHÔNG bao giờ ném ra ngoài.
   */
  async runScheduledPublishJob(): Promise<{ published: number; failed: number }> {
    let published = 0;
    let failed = 0;
    if (!isFacebookConfigured()) return { published, failed };

    await facebookPagePostsRepository
      .recoverStuck(new Date(Date.now() - PROCESSING_TIMEOUT_MS))
      .catch((err) => logger.warn({ err }, 'recoverStuck thất bại'));

    const now = new Date();
    for (let i = 0; i < 50; i += 1) {
      let post: FacebookPagePost | null;
      try {
        post = await facebookPagePostsRepository.claimNextDuePost(now, MAX_RETRY);
      } catch (err) {
        logger.error({ err }, 'claimNextDuePost thất bại');
        break;
      }
      if (!post) break;

      try {
        await publishPost(post);
        published += 1;
        logger.info({ id: post.id }, 'Đã đăng bài Facebook theo lịch');
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Đăng bài thất bại';
        const nextRetry = (post.retryCount ?? 0) + 1;
        if (nextRetry < MAX_RETRY) {
          // Còn lượt → đẩy lại scheduled với backoff tăng dần (5p × lần).
          await facebookPagePostsRepository.update(post.id, {
            status: 'scheduled',
            retryCount: nextRetry,
            errorMessage: message,
            scheduledAt: new Date(Date.now() + nextRetry * 5 * 60 * 1000),
          });
          logger.warn({ id: post.id, nextRetry, message }, 'Đăng bài lỗi — sẽ thử lại');
        } else {
          await facebookPagePostsRepository.update(post.id, {
            status: 'failed',
            retryCount: nextRetry,
            errorMessage: message,
          });
          failed += 1;
          logger.error({ id: post.id, message }, 'Đăng bài thất bại sau nhiều lần thử');
        }
      }
    }

    if (published || failed) logger.info({ published, failed }, 'Cron đăng bài Facebook hoàn tất');
    return { published, failed };
  },
};

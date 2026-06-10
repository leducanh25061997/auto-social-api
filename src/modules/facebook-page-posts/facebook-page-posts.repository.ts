import { isValidObjectId, type FilterQuery } from 'mongoose';

import {
  FacebookPagePostModel,
  type FacebookPagePostDoc,
} from '../../models/facebook-page-post.model';
import { serialize, serializeMany } from '../../models/serialize';
import type {
  FacebookPagePost,
  FacebookPagePostCreateData,
  FacebookPagePostUpdateData,
} from '../../models/types';
import type { ListFacebookPostsQuery } from './facebook-page-posts.schema';

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tách truy cập DB khỏi business logic. Trả entity phẳng. */
export const facebookPagePostsRepository = {
  async list(
    query: ListFacebookPostsQuery,
  ): Promise<{ items: FacebookPagePost[]; total: number }> {
    const { page, limit, search, status, facebookAccountId, pageId } = query;

    const filter: FilterQuery<FacebookPagePostDoc> = {};
    if (status) filter.status = status;
    if (pageId) filter.pageId = pageId;
    if (facebookAccountId && isValidObjectId(facebookAccountId)) {
      filter.facebookAccountId = facebookAccountId;
    }
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ message: rx }, { pageName: rx }];
    }

    // Bài đã lên lịch: sắp xếp theo giờ đăng tăng dần; còn lại theo mới nhất.
    const sort = status === 'scheduled' ? { scheduledAt: 1 as const } : { createdAt: -1 as const };

    const [items, total] = await Promise.all([
      FacebookPagePostModel.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      FacebookPagePostModel.countDocuments(filter),
    ]);

    return { items: serializeMany<FacebookPagePost>(items), total };
  },

  async findById(id: string): Promise<FacebookPagePost | null> {
    if (!isValidObjectId(id)) return null;
    return serialize<FacebookPagePost>(await FacebookPagePostModel.findById(id).lean());
  },

  async create(data: FacebookPagePostCreateData): Promise<FacebookPagePost> {
    const doc = await FacebookPagePostModel.create(data);
    return serialize<FacebookPagePost>(doc.toObject()) as FacebookPagePost;
  },

  async update(
    id: string,
    data: FacebookPagePostUpdateData,
  ): Promise<FacebookPagePost> {
    const doc = await FacebookPagePostModel.findByIdAndUpdate(id, data, {
      new: true,
    }).lean();
    return serialize<FacebookPagePost>(doc) as FacebookPagePost;
  },

  async delete(id: string): Promise<void> {
    await FacebookPagePostModel.findByIdAndDelete(id);
  },

  async countScheduledByAccount(facebookAccountId: string): Promise<number> {
    if (!isValidObjectId(facebookAccountId)) return 0;
    return FacebookPagePostModel.countDocuments({
      facebookAccountId,
      status: 'scheduled',
    });
  },

  // ── Dùng cho cron ──────────────────────────────────────────────────────────

  /** Đưa các bài kẹt ở "processing" quá lâu về "scheduled" để thử lại. */
  async recoverStuck(threshold: Date): Promise<void> {
    await FacebookPagePostModel.updateMany(
      { status: 'processing', updatedAt: { $lt: threshold } },
      { $set: { status: 'scheduled' } },
    );
  },

  /**
   * Lấy NGUYÊN TỬ 1 bài đã tới giờ & còn lượt retry, đánh dấu "processing".
   * Trả null nếu không còn bài nào — dùng để loop trong cron.
   */
  async claimNextDuePost(
    now: Date,
    maxRetry: number,
  ): Promise<FacebookPagePost | null> {
    const doc = await FacebookPagePostModel.findOneAndUpdate(
      { status: 'scheduled', scheduledAt: { $lte: now }, retryCount: { $lt: maxRetry } },
      { $set: { status: 'processing' } },
      { sort: { scheduledAt: 1 }, new: true },
    ).lean();
    return serialize<FacebookPagePost>(doc);
  },
};

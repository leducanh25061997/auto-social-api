import { isValidObjectId, type FilterQuery } from 'mongoose';

import {
  FacebookAccountModel,
  type FacebookAccountDoc,
} from '../../models/facebook-account.model';
import { serialize, serializeMany } from '../../models/serialize';
import type {
  FacebookAccount,
  FacebookAccountCreateData,
  FacebookAccountUpdateData,
} from '../../models/types';
import type { ListFacebookAccountsQuery } from './facebook-accounts.schema';

/** Escape ký tự đặc biệt để dùng `search` an toàn trong RegExp. */
const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tách truy cập DB (Mongoose) khỏi business logic. Trả entity phẳng. */
export const facebookAccountsRepository = {
  async list(
    query: ListFacebookAccountsQuery,
  ): Promise<{ items: FacebookAccount[]; total: number }> {
    const { page, limit, search, status } = query;

    const filter: FilterQuery<FacebookAccountDoc> = {};
    if (status) filter.isActive = status === 'active';
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: rx }, { fbUserId: rx }];
    }

    const itemsQuery = FacebookAccountModel.find(filter).sort({ createdAt: -1 });
    // Không có limit -> lấy hết; có limit -> phân trang.
    if (limit !== undefined) {
      itemsQuery.skip((page - 1) * limit).limit(limit);
    }

    const [items, total] = await Promise.all([
      itemsQuery.lean(),
      FacebookAccountModel.countDocuments(filter),
    ]);

    return { items: serializeMany<FacebookAccount>(items), total };
  },

  /** Mọi tài khoản đang bật — dùng cho job refresh token định kỳ. */
  async findActive(): Promise<FacebookAccount[]> {
    return serializeMany<FacebookAccount>(
      await FacebookAccountModel.find({ isActive: true }).lean(),
    );
  },

  async findById(id: string): Promise<FacebookAccount | null> {
    if (!isValidObjectId(id)) return null;
    return serialize<FacebookAccount>(await FacebookAccountModel.findById(id).lean());
  },

  async findByFbUserId(fbUserId: string): Promise<FacebookAccount | null> {
    return serialize<FacebookAccount>(
      await FacebookAccountModel.findOne({ fbUserId }).lean(),
    );
  },

  async create(data: FacebookAccountCreateData): Promise<FacebookAccount> {
    const doc = await FacebookAccountModel.create(data);
    return serialize<FacebookAccount>(doc.toObject()) as FacebookAccount;
  },

  async update(
    id: string,
    data: FacebookAccountUpdateData,
  ): Promise<FacebookAccount> {
    const doc = await FacebookAccountModel.findByIdAndUpdate(id, data, {
      new: true,
    }).lean();
    return serialize<FacebookAccount>(doc) as FacebookAccount;
  },

  async delete(id: string): Promise<void> {
    await FacebookAccountModel.findByIdAndDelete(id);
  },
};

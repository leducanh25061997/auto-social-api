import { isValidObjectId, type FilterQuery } from 'mongoose';

import {
  InstagramAccountModel,
  type InstagramAccountDoc,
} from '../../models/instagram-account.model';
import { serialize, serializeMany } from '../../models/serialize';
import type {
  InstagramAccount,
  InstagramAccountCreateData,
  InstagramAccountUpdateData,
} from '../../models/types';
import type { ListInstagramAccountsQuery } from './instagram-accounts.schema';

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tách truy cập DB (Mongoose) khỏi business logic. Trả entity phẳng. */
export const instagramAccountsRepository = {
  async list(
    query: ListInstagramAccountsQuery,
  ): Promise<{ items: InstagramAccount[]; total: number }> {
    const { page, limit, search, status } = query;

    const filter: FilterQuery<InstagramAccountDoc> = {};
    if (status) filter.isActive = status === 'active';
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ username: rx }, { name: rx }, { igUserId: rx }];
    }

    const [items, total] = await Promise.all([
      InstagramAccountModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      InstagramAccountModel.countDocuments(filter),
    ]);

    return { items: serializeMany<InstagramAccount>(items), total };
  },

  /** Mọi tài khoản đang bật — dùng cho job refresh token định kỳ. */
  async findActive(): Promise<InstagramAccount[]> {
    return serializeMany<InstagramAccount>(
      await InstagramAccountModel.find({ isActive: true }).lean(),
    );
  },

  async findById(id: string): Promise<InstagramAccount | null> {
    if (!isValidObjectId(id)) return null;
    return serialize<InstagramAccount>(await InstagramAccountModel.findById(id).lean());
  },

  async findByIgUserId(igUserId: string): Promise<InstagramAccount | null> {
    return serialize<InstagramAccount>(
      await InstagramAccountModel.findOne({ igUserId }).lean(),
    );
  },

  async create(data: InstagramAccountCreateData): Promise<InstagramAccount> {
    const doc = await InstagramAccountModel.create(data);
    return serialize<InstagramAccount>(doc.toObject()) as InstagramAccount;
  },

  async update(
    id: string,
    data: InstagramAccountUpdateData,
  ): Promise<InstagramAccount> {
    const doc = await InstagramAccountModel.findByIdAndUpdate(id, data, {
      new: true,
    }).lean();
    return serialize<InstagramAccount>(doc) as InstagramAccount;
  },

  async delete(id: string): Promise<void> {
    await InstagramAccountModel.findByIdAndDelete(id);
  },
};

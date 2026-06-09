import { isValidObjectId, type FilterQuery } from 'mongoose';

import { UserModel, type UserDoc } from '../../models/user.model';
import { RefreshTokenModel } from '../../models/refresh-token.model';
import { serialize, serializeMany } from '../../models/serialize';
import type { User, UserCreateData, UserUpdateData } from '../../models/types';
import type { ListUsersQuery } from './users.schema';

/** Escape ký tự đặc biệt để dùng `search` an toàn trong RegExp (tránh injection). */
const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Tách truy cập DB (Mongoose) khỏi business logic.
 * Trả entity phẳng; service chịu trách nhiệm loại bỏ field nhạy cảm.
 */
export const usersRepository = {
  /** Danh sách user có phân trang + lọc; trả kèm tổng số để tính totalPages. */
  async list(query: ListUsersQuery): Promise<{ items: User[]; total: number }> {
    const { page, limit, search, role } = query;

    const filter: FilterQuery<UserDoc> = {};
    if (role) filter.role = role;
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i'); // 'i' = không phân biệt hoa thường
      filter.$or = [{ username: rx }, { name: rx }, { email: rx }];
    }

    // Chạy song song query + count để giảm round-trip.
    const [items, total] = await Promise.all([
      UserModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(filter),
    ]);

    return { items: serializeMany<User>(items), total };
  },

  async findById(id: string): Promise<User | null> {
    if (!isValidObjectId(id)) return null;
    return serialize<User>(await UserModel.findById(id).lean());
  },

  async findByUsername(username: string): Promise<User | null> {
    return serialize<User>(await UserModel.findOne({ username }).lean());
  },

  async findByEmail(email: string): Promise<User | null> {
    return serialize<User>(await UserModel.findOne({ email }).lean());
  },

  async create(data: UserCreateData): Promise<User> {
    const doc = await UserModel.create(data);
    return serialize<User>(doc.toObject()) as User;
  },

  async update(id: string, data: UserUpdateData): Promise<User> {
    const doc = await UserModel.findByIdAndUpdate(id, data, { new: true }).lean();
    return serialize<User>(doc) as User;
  },

  async delete(id: string): Promise<void> {
    await UserModel.findByIdAndDelete(id);
    // Không còn cascade ở tầng DB -> tự dọn refresh token của user (mô phỏng onDelete: Cascade).
    await RefreshTokenModel.deleteMany({ userId: id });
  },
};

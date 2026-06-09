import { isValidObjectId } from 'mongoose';

import { UserModel } from '../../models/user.model';
import { RefreshTokenModel } from '../../models/refresh-token.model';
import { serialize } from '../../models/serialize';
import type {
  RefreshToken,
  User,
  UserCreateData,
  UserUpdateData,
} from '../../models/types';

/**
 * Tách truy cập DB (Mongoose) khỏi business logic (service).
 * Repo luôn trả entity PHẲNG (`models/types`) — service không cần biết Mongoose.
 */
export const authRepository = {
  async findByUsername(username: string): Promise<User | null> {
    return serialize<User>(await UserModel.findOne({ username }).lean());
  },

  async findById(id: string): Promise<User | null> {
    if (!isValidObjectId(id)) return null;
    return serialize<User>(await UserModel.findById(id).lean());
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

  // --- Refresh tokens (rotation + revoke) ---

  async createRefreshToken(data: {
    tokenHash: string;
    userId: string;
    expiresAt: Date;
  }): Promise<RefreshToken> {
    const doc = await RefreshTokenModel.create(data);
    return serialize<RefreshToken>(doc.toObject()) as RefreshToken;
  },

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | null> {
    return serialize<RefreshToken>(
      await RefreshTokenModel.findOne({ tokenHash }).lean(),
    );
  },

  async revokeRefreshToken(id: string): Promise<void> {
    await RefreshTokenModel.findByIdAndUpdate(id, { revokedAt: new Date() });
  },

  /** Thu hồi toàn bộ refresh token còn hiệu lực của 1 user (logout-all / reuse detection). */
  async revokeAllForUser(userId: string): Promise<void> {
    await RefreshTokenModel.updateMany(
      { userId, revokedAt: null },
      { revokedAt: new Date() },
    );
  },
};

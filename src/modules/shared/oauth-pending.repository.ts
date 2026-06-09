import { isValidObjectId } from 'mongoose';

import { OAuthPendingModel } from '../../models/oauth-pending.model';
import { serialize } from '../../models/serialize';
import type { OAuthPending, OAuthPendingCreateData } from '../../models/types';

/**
 * Lưu tạm thông tin kết nối OAuth (token + hồ sơ) giữa bước "đăng nhập" và bước
 * "xác nhận tạo tài khoản". Dùng chung cho cả Facebook và Instagram.
 */
export const oauthPendingRepository = {
  async create(data: OAuthPendingCreateData): Promise<OAuthPending> {
    const doc = await OAuthPendingModel.create(data);
    return serialize<OAuthPending>(doc.toObject()) as OAuthPending;
  },

  async findById(id: string): Promise<OAuthPending | null> {
    if (!isValidObjectId(id)) return null;
    return serialize<OAuthPending>(await OAuthPendingModel.findById(id).lean());
  },

  async delete(id: string): Promise<void> {
    if (!isValidObjectId(id)) return;
    await OAuthPendingModel.findByIdAndDelete(id);
  },
};

import mongoose, { Schema, model, type Model } from 'mongoose';

/**
 * Tài khoản Facebook đã kết nối qua OAuth (Graph API).
 * `accessToken` là long-lived user token — KHÔNG bao giờ trả ra ngoài (service strip).
 */
export interface FacebookAccountDoc {
  /** Facebook user id (UID) — định danh duy nhất 1 tài khoản. */
  fbUserId: string;
  name: string;
  picture: string | null;
  /** Long-lived access token (nhạy cảm). */
  accessToken: string;
  /** Thời điểm token hết hạn (để biết khi nào cần refresh). */
  tokenExpiresAt: Date | null;
  /** Bật/tắt sử dụng tài khoản này. */
  isActive: boolean;
  /** Lần gia hạn token gần nhất. */
  lastRefreshedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const facebookAccountSchema = new Schema<FacebookAccountDoc>(
  {
    fbUserId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    picture: { type: String, default: null },
    accessToken: { type: String, required: true },
    tokenExpiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    lastRefreshedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'facebook_accounts' },
);

// Guard tránh OverwriteModelError khi module được nạp lại (test/hot-reload).
export const FacebookAccountModel: Model<FacebookAccountDoc> =
  (mongoose.models.FacebookAccount as Model<FacebookAccountDoc>) ??
  model<FacebookAccountDoc>('FacebookAccount', facebookAccountSchema);

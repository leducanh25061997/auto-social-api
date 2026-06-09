import mongoose, { Schema, model, type Model } from 'mongoose';

/**
 * Kết nối OAuth ĐANG CHỜ xác nhận. Sau khi đăng nhập, ta đổi code lấy token + hồ sơ
 * rồi lưu TẠM ở đây (token KHÔNG đi qua client). Người dùng xem trước hồ sơ, bấm
 * "Tạo tài khoản" thì mới tạo bản ghi chính thức.
 *
 * Tự xoá sau 10 phút (TTL index) — nếu người dùng không xác nhận thì coi như bỏ.
 */
export interface OAuthPendingDoc {
  provider: 'facebook' | 'instagram';
  externalId: string;
  name: string | null;
  username: string | null;
  picture: string | null;
  accessToken: string;
  tokenExpiresAt: Date | null;
  createdAt: Date;
}

const oauthPendingSchema = new Schema<OAuthPendingDoc>(
  {
    provider: { type: String, enum: ['facebook', 'instagram'], required: true },
    externalId: { type: String, required: true },
    name: { type: String, default: null },
    username: { type: String, default: null },
    picture: { type: String, default: null },
    accessToken: { type: String, required: true },
    tokenExpiresAt: { type: Date, default: null },
    // TTL: bản ghi tự hết hạn sau 600s kể từ createdAt.
    createdAt: { type: Date, default: Date.now, expires: 600 },
  },
  { collection: 'oauth_pending' },
);

export const OAuthPendingModel: Model<OAuthPendingDoc> =
  (mongoose.models.OAuthPending as Model<OAuthPendingDoc>) ??
  model<OAuthPendingDoc>('OAuthPending', oauthPendingSchema);

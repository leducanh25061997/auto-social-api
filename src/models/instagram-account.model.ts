import mongoose, { Schema, model, type Model } from 'mongoose';

/**
 * Tài khoản Instagram đã kết nối qua "Instagram API with Instagram Login".
 * `accessToken` là long-lived token — KHÔNG bao giờ trả ra ngoài (service strip).
 */
export interface InstagramAccountDoc {
  /** Instagram user id (định danh duy nhất 1 tài khoản). */
  igUserId: string;
  username: string;
  name: string | null;
  picture: string | null;
  accessToken: string;
  tokenExpiresAt: Date | null;
  isActive: boolean;
  lastRefreshedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const instagramAccountSchema = new Schema<InstagramAccountDoc>(
  {
    igUserId: { type: String, required: true, unique: true, trim: true },
    username: { type: String, required: true, trim: true },
    name: { type: String, default: null, trim: true },
    picture: { type: String, default: null },
    accessToken: { type: String, required: true },
    tokenExpiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    lastRefreshedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'instagram_accounts' },
);

export const InstagramAccountModel: Model<InstagramAccountDoc> =
  (mongoose.models.InstagramAccount as Model<InstagramAccountDoc>) ??
  model<InstagramAccountDoc>('InstagramAccount', instagramAccountSchema);

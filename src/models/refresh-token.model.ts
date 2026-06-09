import mongoose, { Schema, model, type Model } from 'mongoose';

/**
 * Refresh token đã hash — hỗ trợ rotation + revoke/logout + phát hiện tái sử dụng.
 * `userId` lưu dạng string (= User.id) để khớp entity phẳng, không cần cast ObjectId.
 */
export interface RefreshTokenDoc {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  // Chỉ cần createdAt, không cần updatedAt.
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'refresh_tokens' },
);

export const RefreshTokenModel: Model<RefreshTokenDoc> =
  (mongoose.models.RefreshToken as Model<RefreshTokenDoc>) ??
  model<RefreshTokenDoc>('RefreshToken', refreshTokenSchema);

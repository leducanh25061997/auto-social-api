import mongoose, { Schema, model, type Model } from 'mongoose';
import type { Role } from './types';

/** Shape của document trong MongoDB (chưa serialize — vẫn còn `_id`). */
export interface UserDoc {
  username: string;
  email: string | null;
  name: string | null;
  password: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, default: null, trim: true, lowercase: true },
    name: { type: String, default: null, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER' },
  },
  { timestamps: true, collection: 'users' },
);

// email là optional + unique: dùng PARTIAL index để CHỈ ràng buộc trùng khi
// email là chuỗi (bỏ qua null). Tránh lỗi "duplicate null" giữa nhiều user không
// có email (MongoDB unique index thường coi mọi null là trùng nhau).
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);

// Guard tránh OverwriteModelError khi module được nạp lại (test/hot-reload).
export const UserModel: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ?? model<UserDoc>('User', userSchema);

/**
 * Kiểu entity phẳng (plain) dùng xuyên suốt service/controller — KHÔNG phải
 * document Mongoose. Repository chịu trách nhiệm chuyển doc -> entity này
 * (đổi `_id` -> `id`) để tầng business không phụ thuộc Mongoose.
 */

export type Role = 'USER' | 'ADMIN';

export interface User {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  password: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshToken {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Dữ liệu tạo user. */
export type UserCreateData = {
  username: string;
  password: string;
  name?: string | null;
  email?: string | null;
  role?: Role;
};

/** Dữ liệu cập nhật user. */
export type UserUpdateData = Partial<{
  name: string | null;
  email: string | null;
  password: string;
  role: Role;
}>;

// ── Facebook account ─────────────────────────────────────────────────────────

/** Entity phẳng của 1 tài khoản Facebook đã kết nối. */
export interface FacebookAccount {
  id: string;
  fbUserId: string;
  name: string;
  picture: string | null;
  accessToken: string;
  tokenExpiresAt: Date | null;
  isActive: boolean;
  lastRefreshedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Tài khoản Facebook an toàn để trả ra ngoài — KHÔNG bao giờ chứa accessToken. */
export type SafeFacebookAccount = Omit<FacebookAccount, 'accessToken'>;

/** Dữ liệu tạo/ghi đè tài khoản Facebook (khi connect/upsert). */
export type FacebookAccountCreateData = {
  fbUserId: string;
  name: string;
  picture?: string | null;
  accessToken: string;
  tokenExpiresAt?: Date | null;
  isActive?: boolean;
  lastRefreshedAt?: Date | null;
};

/** Dữ liệu cập nhật tài khoản Facebook. */
export type FacebookAccountUpdateData = Partial<{
  name: string;
  picture: string | null;
  accessToken: string;
  tokenExpiresAt: Date | null;
  isActive: boolean;
  lastRefreshedAt: Date | null;
}>;

// ── Instagram account ────────────────────────────────────────────────────────

/** Entity phẳng của 1 tài khoản Instagram đã kết nối. */
export interface InstagramAccount {
  id: string;
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

/** Tài khoản Instagram an toàn để trả ra ngoài — KHÔNG chứa accessToken. */
export type SafeInstagramAccount = Omit<InstagramAccount, 'accessToken'>;

/** Dữ liệu tạo/ghi đè tài khoản Instagram (khi connect/upsert). */
export type InstagramAccountCreateData = {
  igUserId: string;
  username: string;
  name?: string | null;
  picture?: string | null;
  accessToken: string;
  tokenExpiresAt?: Date | null;
  isActive?: boolean;
  lastRefreshedAt?: Date | null;
};

/** Dữ liệu cập nhật tài khoản Instagram. */
export type InstagramAccountUpdateData = Partial<{
  username: string;
  name: string | null;
  picture: string | null;
  accessToken: string;
  tokenExpiresAt: Date | null;
  isActive: boolean;
  lastRefreshedAt: Date | null;
}>;

// ── OAuth pending (kết nối đang chờ xác nhận) ────────────────────────────────

export interface OAuthPending {
  id: string;
  provider: 'facebook' | 'instagram';
  externalId: string;
  name: string | null;
  username: string | null;
  picture: string | null;
  accessToken: string;
  tokenExpiresAt: Date | null;
  createdAt: Date;
}

export type OAuthPendingCreateData = {
  provider: 'facebook' | 'instagram';
  externalId: string;
  name?: string | null;
  username?: string | null;
  picture?: string | null;
  accessToken: string;
  tokenExpiresAt?: Date | null;
};

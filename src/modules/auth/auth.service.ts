import type { User } from '../../models/types';
import { authRepository } from './auth.repository';
import type {
  ChangePasswordInput,
  LoginInput,
  RefreshInput,
  RegisterInput,
  UpdateMeInput,
} from './auth.schema';
import { hashPassword, sha256, verifyPassword } from '../../utils/hashing';
import {
  getTokenExpiry,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt';
import { ApiError } from '../../utils/ApiError';

/** User an toàn để trả ra ngoài — KHÔNG bao giờ chứa password. */
export type SafeUser = Omit<User, 'password'>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends TokenPair {
  user: SafeUser;
}

const toSafeUser = (user: User): SafeUser => {
  // Loại bỏ field nhạy cảm một cách tường minh.
  const { password: _password, ...safe } = user;
  return safe;
};

/** Phát hành cặp token mới VÀ lưu refresh token (đã hash) vào DB để rotation/revoke. */
const issueTokens = async (user: User): Promise<TokenPair> => {
  const payload = { sub: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await authRepository.createRefreshToken({
    tokenHash: sha256(refreshToken),
    userId: user.id,
    expiresAt: getTokenExpiry(refreshToken),
  });

  return { accessToken, refreshToken };
};

export const authService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await authRepository.findByUsername(input.username);
    if (existing) throw ApiError.conflict('Username đã tồn tại');

    const password = await hashPassword(input.password);
    const user = await authRepository.create({
      username: input.username,
      name: input.name ?? null,
      password,
    });

    const tokens = await issueTokens(user);
    return { user: toSafeUser(user), ...tokens };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await authRepository.findByUsername(input.username);
    // Thông báo mơ hồ để tránh dò tài khoản (user enumeration).
    if (!user) throw ApiError.unauthorized('Username hoặc mật khẩu không đúng');

    const valid = await verifyPassword(user.password, input.password);
    if (!valid) throw ApiError.unauthorized('Username hoặc mật khẩu không đúng');

    const tokens = await issueTokens(user);
    return { user: toSafeUser(user), ...tokens };
  },

  /**
   * Refresh token ROTATION: token cũ bị thu hồi, cấp cặp mới.
   * Nếu phát hiện token đã bị thu hồi được dùng lại -> thu hồi toàn bộ token của user.
   */
  async refresh(input: RefreshInput): Promise<TokenPair> {
    const payload = verifyRefreshToken(input.refreshToken);
    const stored = await authRepository.findRefreshTokenByHash(sha256(input.refreshToken));

    if (!stored) throw ApiError.unauthorized('Refresh token không hợp lệ');

    if (stored.revokedAt) {
      // Reuse detection: token này đã bị xoay vòng -> coi như bị đánh cắp.
      await authRepository.revokeAllForUser(stored.userId);
      throw ApiError.unauthorized('Refresh token đã bị thu hồi, vui lòng đăng nhập lại');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw ApiError.unauthorized('Refresh token đã hết hạn');
    }

    const user = await authRepository.findById(payload.sub);
    if (!user) throw ApiError.unauthorized('User không tồn tại');

    await authRepository.revokeRefreshToken(stored.id); // xoay vòng
    return issueTokens(user);
  },

  /** Logout: thu hồi refresh token đang dùng (idempotent). */
  async logout(input: RefreshInput): Promise<void> {
    const stored = await authRepository.findRefreshTokenByHash(sha256(input.refreshToken));
    if (stored && !stored.revokedAt) {
      await authRepository.revokeRefreshToken(stored.id);
    }
  },

  async me(userId: string): Promise<SafeUser> {
    const user = await authRepository.findById(userId);
    if (!user) throw ApiError.notFound('User không tồn tại');
    return toSafeUser(user);
  },

  /** Cập nhật hồ sơ của chính mình (name, email). */
  async updateMe(userId: string, input: UpdateMeInput): Promise<SafeUser> {
    const user = await authRepository.findById(userId);
    if (!user) throw ApiError.notFound('User không tồn tại');

    if (input.email) {
      const owner = await authRepository.findByEmail(input.email);
      if (owner && owner.id !== userId) {
        throw ApiError.conflict('Email đã được sử dụng');
      }
    }

    const updated = await authRepository.update(userId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
    });
    return toSafeUser(updated);
  },

  /**
   * Đổi mật khẩu của chính mình.
   * Bảo mật: xác minh mật khẩu hiện tại, rồi thu hồi TOÀN BỘ refresh token để
   * vô hiệu hoá mọi phiên cũ (buộc đăng nhập lại ở mọi thiết bị).
   */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await authRepository.findById(userId);
    if (!user) throw ApiError.notFound('User không tồn tại');

    const valid = await verifyPassword(user.password, input.currentPassword);
    if (!valid) throw ApiError.unauthorized('Mật khẩu hiện tại không đúng');

    const password = await hashPassword(input.newPassword);
    await authRepository.update(userId, { password });
    await authRepository.revokeAllForUser(userId);
  },
};

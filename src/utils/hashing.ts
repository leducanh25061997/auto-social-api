import argon2 from 'argon2';
import { createHash } from 'node:crypto';

/** Hash password bằng argon2id (mặc định an toàn). */
export const hashPassword = (plain: string): Promise<string> =>
  argon2.hash(plain, { type: argon2.argon2id });

/** So sánh password thô với hash đã lưu. */
export const verifyPassword = (hash: string, plain: string): Promise<boolean> =>
  argon2.verify(hash, plain);

/**
 * Hash nhanh (SHA-256) dùng cho refresh token trước khi lưu DB.
 * Không lưu token thô — nếu DB rò rỉ, token không bị lộ.
 */
export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

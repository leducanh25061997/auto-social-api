import argon2 from 'argon2';

import { connectDB, disconnectDB } from './config/db';
import { UserModel } from './models/user.model';

/**
 * Seed tài khoản admin mặc định (idempotent — an toàn khi chạy lại mỗi lần deploy).
 * KHÔNG ghi đè nếu tài khoản đã tồn tại (không reset mật khẩu).
 * Override qua ENV: ADMIN_USERNAME, ADMIN_PASSWORD.
 */
async function main(): Promise<void> {
  await connectDB();

  const username = (process.env.ADMIN_USERNAME ?? 'adminleducanh').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'Leducanh25@';

  const existing = await UserModel.findOne({ username });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`ℹ️  Admin đã tồn tại: ${existing.username} (role=${existing.role})`);
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await UserModel.create({
    username,
    name: 'Administrator',
    password: passwordHash,
    role: 'ADMIN',
  });

  // eslint-disable-next-line no-console
  console.log(`✅ Admin sẵn sàng: ${admin.username} (role=${admin.role})`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('❌ Seed thất bại:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void disconnectDB();
  });

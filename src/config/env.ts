import 'dotenv/config';
import { z } from 'zod';

/**
 * Validate & type tất cả biến môi trường ngay khi khởi động.
 * Nếu thiếu/sai -> app fail-fast thay vì lỗi mơ hồ lúc runtime.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGIN: z.string().default('*'),

  // --- Facebook (OAuth + Graph API) ---
  // Để TRỐNG nếu chưa dùng tính năng kết nối Facebook. Khi trống, các endpoint
  // Facebook trả thông báo "chưa cấu hình" thân thiện thay vì lỗi kỹ thuật.
  FACEBOOK_APP_ID: z.string().default(''),
  FACEBOOK_APP_SECRET: z.string().default(''),
  FACEBOOK_GRAPH_VERSION: z.string().default('v23.0'),

  // --- Instagram (Instagram API with Instagram Login) ---
  // Để TRỐNG nếu chưa dùng. App ID/Secret lấy từ Meta App > Instagram > API setup.
  INSTAGRAM_APP_ID: z.string().default(''),
  INSTAGRAM_APP_SECRET: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    '❌ Invalid environment variables:',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

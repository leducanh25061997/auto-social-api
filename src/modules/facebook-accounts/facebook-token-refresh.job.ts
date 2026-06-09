import { facebookAccountsService } from './facebook-accounts.service';
import { isFacebookConfigured } from './facebook-graph';
import { logger } from '../../utils/logger';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** Chạy lần đầu sau khi server ổn định (không chặn khởi động). */
const INITIAL_DELAY_MS = 30 * 1000;

let started = false;

/** Chạy 1 lượt refresh, nuốt mọi lỗi để KHÔNG bao giờ làm sập tiến trình. */
const runOnce = async (): Promise<void> => {
  try {
    await facebookAccountsService.refreshExpiringTokens();
  } catch (err) {
    logger.error({ err }, 'Facebook token refresh job: lỗi không mong đợi');
  }
};

/**
 * Khởi động job tự gia hạn long-lived token Facebook (mỗi 24h).
 * - Bỏ qua nếu chưa cấu hình App ID/Secret.
 * - `unref()` để job không giữ tiến trình sống khi shutdown.
 * - An toàn gọi nhiều lần (idempotent).
 */
export const startFacebookTokenRefreshJob = (): void => {
  if (started) return;
  if (!isFacebookConfigured()) {
    logger.info('Facebook token refresh job: bỏ qua (chưa cấu hình Facebook)');
    return;
  }
  started = true;

  setTimeout(() => void runOnce(), INITIAL_DELAY_MS).unref();
  setInterval(() => void runOnce(), ONE_DAY_MS).unref();

  logger.info('Facebook token refresh job: đã kích hoạt (chu kỳ 24h)');
};

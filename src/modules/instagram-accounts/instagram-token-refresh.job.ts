import { instagramAccountsService } from './instagram-accounts.service';
import { isInstagramConfigured } from './instagram-graph';
import { logger } from '../../utils/logger';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 45 * 1000;

let started = false;

const runOnce = async (): Promise<void> => {
  try {
    await instagramAccountsService.refreshExpiringTokens();
  } catch (err) {
    logger.error({ err }, 'Instagram token refresh job: lỗi không mong đợi');
  }
};

/**
 * Khởi động job tự gia hạn long-lived token Instagram (mỗi 24h).
 * Bỏ qua nếu chưa cấu hình; `unref()` để không giữ tiến trình sống; idempotent.
 */
export const startInstagramTokenRefreshJob = (): void => {
  if (started) return;
  if (!isInstagramConfigured()) {
    logger.info('Instagram token refresh job: bỏ qua (chưa cấu hình Instagram)');
    return;
  }
  started = true;

  setTimeout(() => void runOnce(), INITIAL_DELAY_MS).unref();
  setInterval(() => void runOnce(), ONE_DAY_MS).unref();

  logger.info('Instagram token refresh job: đã kích hoạt (chu kỳ 24h)');
};

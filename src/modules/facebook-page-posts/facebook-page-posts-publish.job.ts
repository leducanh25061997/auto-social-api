import { facebookPagePostsService } from './facebook-page-posts.service';
import { isFacebookConfigured } from '../facebook-accounts/facebook-graph';
import { logger } from '../../utils/logger';

const ONE_MINUTE_MS = 60 * 1000;
const INITIAL_DELAY_MS = 20 * 1000;

let started = false;

/** Chạy 1 lượt, nuốt mọi lỗi để KHÔNG bao giờ làm sập tiến trình. */
const runOnce = async (): Promise<void> => {
  try {
    await facebookPagePostsService.runScheduledPublishJob();
  } catch (err) {
    logger.error({ err }, 'Facebook publish job: lỗi không mong đợi');
  }
};

/**
 * Khởi động job đăng bài Facebook đã lên lịch (mỗi phút).
 * - Bỏ qua nếu chưa cấu hình App ID/Secret.
 * - `unref()` để job không giữ tiến trình sống khi shutdown.
 * - An toàn gọi nhiều lần (idempotent).
 */
export const startFacebookPublishJob = (): void => {
  if (started) return;
  if (!isFacebookConfigured()) {
    logger.info('Facebook publish job: bỏ qua (chưa cấu hình Facebook)');
    return;
  }
  started = true;

  setTimeout(() => void runOnce(), INITIAL_DELAY_MS).unref();
  setInterval(() => void runOnce(), ONE_MINUTE_MS).unref();

  logger.info('Facebook publish job: đã kích hoạt (chu kỳ 1 phút)');
};

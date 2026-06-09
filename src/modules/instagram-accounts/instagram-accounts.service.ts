import type { InstagramAccount, SafeInstagramAccount } from '../../models/types';
import { instagramAccountsRepository } from './instagram-accounts.repository';
import {
  assertInstagramConfigured,
  connectWithCode,
  isInstagramConfigured,
  refreshToken,
  type InstagramTokenResult,
} from './instagram-graph';
import { oauthPendingRepository } from '../shared/oauth-pending.repository';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';
import type {
  ConnectInstagramInput,
  ExchangeInstagramInput,
  ListInstagramAccountsQuery,
  UpdateInstagramAccountInput,
} from './instagram-accounts.schema';

/** Hồ sơ xem trước trả về cho FE ở bước 1 (không kèm token). */
export interface InstagramPreview {
  pendingId: string;
  externalId: string;
  username: string;
  name: string | null;
  picture: string | null;
}

/** Loại bỏ accessToken trước khi trả ra ngoài. */
const toSafe = (account: InstagramAccount): SafeInstagramAccount => {
  const { accessToken: _accessToken, ...safe } = account;
  return safe;
};

const toExpiresAt = (token: InstagramTokenResult): Date | null =>
  token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000) : null;

export interface PaginatedInstagramAccounts {
  items: SafeInstagramAccount[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const instagramAccountsService = {
  /**
   * BƯỚC 1 — Đổi `code` lấy hồ sơ để xem trước. Lưu token TẠM (TTL) và trả về
   * hồ sơ + `pendingId`. KHÔNG tạo tài khoản ở bước này.
   */
  async exchange(input: ExchangeInstagramInput): Promise<InstagramPreview> {
    assertInstagramConfigured();

    const { profile, token } = await connectWithCode(input.code, input.redirectUri);

    const pending = await oauthPendingRepository.create({
      provider: 'instagram',
      externalId: profile.id,
      username: profile.username,
      name: profile.name,
      picture: profile.picture,
      accessToken: token.accessToken,
      tokenExpiresAt: toExpiresAt(token),
    });

    return {
      pendingId: pending.id,
      externalId: profile.id,
      username: profile.username,
      name: profile.name,
      picture: profile.picture,
    };
  },

  /**
   * BƯỚC 2 — Xác nhận tạo tài khoản từ `pendingId`.
   * Nếu igUserId đã tồn tại -> cập nhật token + hồ sơ và bật lại (không tạo trùng).
   */
  async connect(input: ConnectInstagramInput): Promise<SafeInstagramAccount> {
    const pending = await oauthPendingRepository.findById(input.pendingId);
    if (!pending || pending.provider !== 'instagram') {
      throw ApiError.badRequest(
        'Phiên kết nối đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
      );
    }

    const name = input.name ?? pending.name;
    const username = pending.username ?? 'instagram';

    const existing = await instagramAccountsRepository.findByIgUserId(pending.externalId);
    const result = existing
      ? await instagramAccountsRepository.update(existing.id, {
          username,
          name,
          picture: pending.picture,
          accessToken: pending.accessToken,
          tokenExpiresAt: pending.tokenExpiresAt,
          isActive: true,
          lastRefreshedAt: new Date(),
        })
      : await instagramAccountsRepository.create({
          igUserId: pending.externalId,
          username,
          name,
          picture: pending.picture,
          accessToken: pending.accessToken,
          tokenExpiresAt: pending.tokenExpiresAt,
          isActive: true,
          lastRefreshedAt: new Date(),
        });

    await oauthPendingRepository.delete(pending.id).catch(() => undefined);

    return toSafe(result);
  },

  async list(query: ListInstagramAccountsQuery): Promise<PaginatedInstagramAccounts> {
    const { items, total } = await instagramAccountsRepository.list(query);
    return {
      items: items.map(toSafe),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  },

  async getById(id: string): Promise<SafeInstagramAccount> {
    const account = await instagramAccountsRepository.findById(id);
    if (!account) throw ApiError.notFound('Không tìm thấy tài khoản Instagram');
    return toSafe(account);
  },

  async update(
    id: string,
    input: UpdateInstagramAccountInput,
  ): Promise<SafeInstagramAccount> {
    const existing = await instagramAccountsRepository.findById(id);
    if (!existing) throw ApiError.notFound('Không tìm thấy tài khoản Instagram');

    const updated = await instagramAccountsRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    return toSafe(updated);
  },

  async remove(id: string): Promise<void> {
    const existing = await instagramAccountsRepository.findById(id);
    if (!existing) throw ApiError.notFound('Không tìm thấy tài khoản Instagram');
    await instagramAccountsRepository.delete(id);
  },

  /**
   * Gia hạn token cho 1 tài khoản theo yêu cầu thủ công.
   * Nếu Instagram báo token hết hạn (401) -> tạm dừng, báo cần kết nối lại.
   */
  async refresh(id: string): Promise<SafeInstagramAccount> {
    const account = await instagramAccountsRepository.findById(id);
    if (!account) throw ApiError.notFound('Không tìm thấy tài khoản Instagram');

    try {
      const token = await refreshToken(account.accessToken);
      const updated = await instagramAccountsRepository.update(id, {
        accessToken: token.accessToken,
        tokenExpiresAt: toExpiresAt(token),
        lastRefreshedAt: new Date(),
      });
      return toSafe(updated);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        await instagramAccountsRepository.update(id, { isActive: false });
      }
      throw err;
    }
  },

  /**
   * Job nền: gia hạn token cho mọi tài khoản đang bật mà token sắp/đã hết hạn.
   * Bọc try/catch TỪNG tài khoản; KHÔNG bao giờ ném ra ngoài (an toàn cho scheduler).
   */
  async refreshExpiringTokens(): Promise<{ refreshed: number; deactivated: number }> {
    let refreshed = 0;
    let deactivated = 0;

    if (!isInstagramConfigured()) return { refreshed, deactivated };

    let accounts: InstagramAccount[] = [];
    try {
      accounts = await instagramAccountsRepository.findActive();
    } catch (err) {
      logger.error({ err }, 'Instagram refresh job: không đọc được danh sách tài khoản');
      return { refreshed, deactivated };
    }

    const THRESHOLD_MS = 10 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const account of accounts) {
      const expiresAt = account.tokenExpiresAt?.getTime();
      if (expiresAt && expiresAt - now > THRESHOLD_MS) continue;

      try {
        const token = await refreshToken(account.accessToken);
        await instagramAccountsRepository.update(account.id, {
          accessToken: token.accessToken,
          tokenExpiresAt: toExpiresAt(token),
          lastRefreshedAt: new Date(),
        });
        refreshed += 1;
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 401) {
          await instagramAccountsRepository
            .update(account.id, { isActive: false })
            .catch(() => undefined);
          deactivated += 1;
        } else {
          logger.warn(
            { err, accountId: account.id },
            'Instagram refresh job: bỏ qua tài khoản do lỗi tạm thời',
          );
        }
      }
    }

    if (refreshed || deactivated) {
      logger.info({ refreshed, deactivated }, 'Instagram refresh job hoàn tất');
    }
    return { refreshed, deactivated };
  },
};

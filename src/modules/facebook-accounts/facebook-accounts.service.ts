import type {
  FacebookAccount,
  SafeFacebookAccount,
} from '../../models/types';
import { facebookAccountsRepository } from './facebook-accounts.repository';
import {
  assertFacebookConfigured,
  connectWithCode,
  extendToken,
  getPages,
  isFacebookConfigured,
  type FacebookPage,
  type FacebookTokenResult,
} from './facebook-graph';
import { oauthPendingRepository } from '../shared/oauth-pending.repository';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';
import type {
  ConnectFacebookInput,
  ExchangeFacebookInput,
  ListFacebookAccountsQuery,
  UpdateFacebookAccountInput,
} from './facebook-accounts.schema';

/** Hồ sơ xem trước trả về cho FE ở bước 1 (không kèm token). */
export interface FacebookPreview {
  pendingId: string;
  externalId: string;
  name: string;
  picture: string | null;
}

/** Loại bỏ accessToken trước khi trả ra ngoài. */
const toSafe = (account: FacebookAccount): SafeFacebookAccount => {
  const { accessToken: _accessToken, ...safe } = account;
  return safe;
};

/** expiresIn (giây) -> Date hết hạn (hoặc null nếu token không hết hạn). */
const toExpiresAt = (token: FacebookTokenResult): Date | null =>
  token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000) : null;

export interface PaginatedFacebookAccounts {
  items: SafeFacebookAccount[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const facebookAccountsService = {
  /**
   * BƯỚC 1 — Đổi `code` lấy hồ sơ để xem trước. Lưu token TẠM (TTL) và trả về
   * hồ sơ + `pendingId`. KHÔNG tạo tài khoản ở bước này.
   */
  async exchange(input: ExchangeFacebookInput): Promise<FacebookPreview> {
    assertFacebookConfigured();

    const { profile, token } = await connectWithCode(input.code, input.redirectUri);

    const pending = await oauthPendingRepository.create({
      provider: 'facebook',
      externalId: profile.id,
      name: profile.name,
      picture: profile.picture,
      accessToken: token.accessToken,
      tokenExpiresAt: toExpiresAt(token),
    });

    return {
      pendingId: pending.id,
      externalId: profile.id,
      name: profile.name,
      picture: profile.picture,
    };
  },

  /**
   * BƯỚC 2 — Xác nhận tạo tài khoản từ `pendingId`.
   * Nếu fbUserId đã tồn tại -> cập nhật token + tên + ảnh và bật lại (không tạo trùng).
   */
  async connect(input: ConnectFacebookInput): Promise<SafeFacebookAccount> {
    const pending = await oauthPendingRepository.findById(input.pendingId);
    if (!pending || pending.provider !== 'facebook') {
      throw ApiError.badRequest(
        'Phiên kết nối đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
      );
    }

    const name = input.name ?? pending.name ?? 'Tài khoản Facebook';

    const existing = await facebookAccountsRepository.findByFbUserId(pending.externalId);
    const result = existing
      ? await facebookAccountsRepository.update(existing.id, {
          name,
          picture: pending.picture,
          accessToken: pending.accessToken,
          tokenExpiresAt: pending.tokenExpiresAt,
          isActive: true,
          lastRefreshedAt: new Date(),
        })
      : await facebookAccountsRepository.create({
          fbUserId: pending.externalId,
          name,
          picture: pending.picture,
          accessToken: pending.accessToken,
          tokenExpiresAt: pending.tokenExpiresAt,
          isActive: true,
          lastRefreshedAt: new Date(),
        });

    // Dọn bản ghi tạm (idempotent — TTL cũng sẽ tự xoá nếu sót).
    await oauthPendingRepository.delete(pending.id).catch(() => undefined);

    return toSafe(result);
  },

  async list(query: ListFacebookAccountsQuery): Promise<PaginatedFacebookAccounts> {
    const { items, total } = await facebookAccountsRepository.list(query);
    return {
      items: items.map(toSafe),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  },

  async getById(id: string): Promise<SafeFacebookAccount> {
    const account = await facebookAccountsRepository.findById(id);
    if (!account) throw ApiError.notFound('Không tìm thấy tài khoản Facebook');
    return toSafe(account);
  },

  async update(
    id: string,
    input: UpdateFacebookAccountInput,
  ): Promise<SafeFacebookAccount> {
    const existing = await facebookAccountsRepository.findById(id);
    if (!existing) throw ApiError.notFound('Không tìm thấy tài khoản Facebook');

    const updated = await facebookAccountsRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    return toSafe(updated);
  },

  async remove(id: string): Promise<void> {
    const existing = await facebookAccountsRepository.findById(id);
    if (!existing) throw ApiError.notFound('Không tìm thấy tài khoản Facebook');
    await facebookAccountsRepository.delete(id);
  },

  /** Danh sách Page mà tài khoản này quản trị (gọi Graph API trực tiếp). */
  async listPages(id: string): Promise<FacebookPage[]> {
    const account = await facebookAccountsRepository.findById(id);
    if (!account) throw ApiError.notFound('Không tìm thấy tài khoản Facebook');
    if (!account.isActive) {
      throw ApiError.badRequest('Tài khoản đang tạm dừng. Hãy bật lại để xem Page.');
    }
    return getPages(account.accessToken);
  },

  /**
   * Gia hạn token cho 1 tài khoản theo yêu cầu thủ công.
   * Nếu Facebook báo token hết hạn (401) -> tạm dừng tài khoản, báo cần kết nối lại.
   */
  async refresh(id: string): Promise<SafeFacebookAccount> {
    const account = await facebookAccountsRepository.findById(id);
    if (!account) throw ApiError.notFound('Không tìm thấy tài khoản Facebook');

    try {
      const token = await extendToken(account.accessToken);
      const updated = await facebookAccountsRepository.update(id, {
        accessToken: token.accessToken,
        tokenExpiresAt: toExpiresAt(token),
        lastRefreshedAt: new Date(),
      });
      return toSafe(updated);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        await facebookAccountsRepository.update(id, { isActive: false });
      }
      throw err;
    }
  },

  /**
   * Job nền: gia hạn token cho mọi tài khoản đang bật mà token sắp/đã hết hạn.
   * Bọc try/catch TỪNG tài khoản để 1 lỗi không ảnh hưởng phần còn lại.
   * KHÔNG bao giờ ném ra ngoài (an toàn để gọi từ scheduler).
   */
  async refreshExpiringTokens(): Promise<{ refreshed: number; deactivated: number }> {
    let refreshed = 0;
    let deactivated = 0;

    if (!isFacebookConfigured()) return { refreshed, deactivated };

    let accounts: FacebookAccount[] = [];
    try {
      accounts = await facebookAccountsRepository.findActive();
    } catch (err) {
      logger.error({ err }, 'Facebook refresh job: không đọc được danh sách tài khoản');
      return { refreshed, deactivated };
    }

    // Chỉ gia hạn khi còn dưới 10 ngày (hoặc không rõ hạn) để tránh gọi thừa.
    const THRESHOLD_MS = 10 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const account of accounts) {
      const expiresAt = account.tokenExpiresAt?.getTime();
      if (expiresAt && expiresAt - now > THRESHOLD_MS) continue;

      try {
        const token = await extendToken(account.accessToken);
        await facebookAccountsRepository.update(account.id, {
          accessToken: token.accessToken,
          tokenExpiresAt: toExpiresAt(token),
          lastRefreshedAt: new Date(),
        });
        refreshed += 1;
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 401) {
          // Token chết -> tạm dừng để người dùng kết nối lại.
          await facebookAccountsRepository
            .update(account.id, { isActive: false })
            .catch(() => undefined);
          deactivated += 1;
        } else {
          logger.warn(
            { err, accountId: account.id },
            'Facebook refresh job: bỏ qua tài khoản do lỗi tạm thời',
          );
        }
      }
    }

    if (refreshed || deactivated) {
      logger.info({ refreshed, deactivated }, 'Facebook refresh job hoàn tất');
    }
    return { refreshed, deactivated };
  },
};

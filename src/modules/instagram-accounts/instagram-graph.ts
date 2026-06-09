import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';

/**
 * Lớp mỏng gọi Instagram API ("Instagram API with Instagram Login"). Mọi hàm:
 * - Bọc try/catch để KHÔNG làm sập tiến trình.
 * - Ném `ApiError` với thông báo tiếng Việt thân thiện.
 * - Ném 401 RIÊNG khi token hết hạn/không hợp lệ để job refresh biết mà tạm dừng.
 *
 * Endpoint:
 *  - Đổi code:   POST https://api.instagram.com/oauth/access_token  (short-lived)
 *  - Long-lived: GET  https://graph.instagram.com/access_token?grant_type=ig_exchange_token
 *  - Refresh:    GET  https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token
 *  - Hồ sơ:      GET  https://graph.instagram.com/me?fields=...
 */

const OAUTH_BASE = 'https://api.instagram.com';
const GRAPH_BASE = 'https://graph.instagram.com';

/** Đã cấu hình App ID + Secret hay chưa. */
export const isInstagramConfigured = (): boolean =>
  Boolean(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET);

/** Đảm bảo đã cấu hình; nếu chưa -> báo lỗi thân thiện. */
export const assertInstagramConfigured = (): void => {
  if (!isInstagramConfigured()) {
    throw ApiError.badRequest(
      'Tính năng kết nối Instagram chưa được cấu hình. Vui lòng liên hệ quản trị viên.',
    );
  }
};

interface InstagramErrorBody {
  error?: { message?: string; code?: number; type?: string };
  error_type?: string;
  error_message?: string;
  code?: number;
}

/** Chuẩn hoá lỗi từ body Instagram thành ApiError thân thiện. */
const toApiError = (body: InstagramErrorBody | null, status: number): ApiError => {
  const code = body?.error?.code ?? body?.code;
  // 190 = token hết hạn/thu hồi; 401/400 ở các endpoint token cũng coi như hết phiên.
  if (code === 190 || status === 401) {
    return new ApiError(401, 'Phiên Instagram đã hết hạn. Vui lòng kết nối lại tài khoản.');
  }
  return ApiError.badRequest(
    'Instagram từ chối yêu cầu. Vui lòng thử lại hoặc kết nối lại tài khoản.',
  );
};

/** GET 1 URL Instagram Graph và trả JSON đã parse. */
const getJson = async <T>(url: string, action: string): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    logger.warn({ err, action }, 'Instagram: lỗi mạng');
    throw ApiError.badRequest('Không kết nối được tới Instagram. Vui lòng thử lại sau.');
  }
  const body = (await res.json().catch(() => null)) as (T & InstagramErrorBody) | null;
  if (!res.ok || !body || (body as InstagramErrorBody).error) {
    logger.warn({ action, status: res.status }, 'Instagram: bị từ chối');
    throw toApiError(body as InstagramErrorBody | null, res.status);
  }
  return body as T;
};

export interface InstagramTokenResult {
  accessToken: string;
  expiresIn?: number;
}

export interface InstagramProfile {
  id: string;
  username: string;
  name: string | null;
  picture: string | null;
}

/** Đổi `code` lấy short-lived token (POST form-encoded). */
const exchangeCodeForToken = async (
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string }> => {
  const form = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID,
    client_secret: env.INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });

  let res: Response;
  try {
    res = await fetch(`${OAUTH_BASE}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  } catch (err) {
    logger.warn({ err }, 'Instagram exchange-code: lỗi mạng');
    throw ApiError.badRequest('Không kết nối được tới Instagram. Vui lòng thử lại sau.');
  }

  const body = (await res.json().catch(() => null)) as
    | ({ access_token: string; user_id?: number | string } & InstagramErrorBody)
    | null;

  if (!res.ok || !body || !body.access_token) {
    logger.warn({ status: res.status }, 'Instagram exchange-code: bị từ chối');
    throw toApiError(body, res.status);
  }
  return { accessToken: body.access_token };
};

/** Đổi short-lived token -> long-lived token (~60 ngày). */
const getLongLivedToken = async (shortToken: string): Promise<InstagramTokenResult> => {
  const url =
    `${GRAPH_BASE}/access_token` +
    `?grant_type=ig_exchange_token` +
    `&client_secret=${encodeURIComponent(env.INSTAGRAM_APP_SECRET)}` +
    `&access_token=${encodeURIComponent(shortToken)}`;
  const data = await getJson<{ access_token: string; expires_in?: number }>(
    url,
    'long-lived-token',
  );
  return {
    accessToken: data.access_token,
    ...(data.expires_in !== undefined ? { expiresIn: data.expires_in } : {}),
  };
};

/** Gia hạn long-lived token hiện có (dùng cho refresh thủ công + job định kỳ). */
export const refreshToken = async (token: string): Promise<InstagramTokenResult> => {
  const url =
    `${GRAPH_BASE}/refresh_access_token` +
    `?grant_type=ig_refresh_token` +
    `&access_token=${encodeURIComponent(token)}`;
  const data = await getJson<{ access_token: string; expires_in?: number }>(
    url,
    'refresh-token',
  );
  return {
    accessToken: data.access_token,
    ...(data.expires_in !== undefined ? { expiresIn: data.expires_in } : {}),
  };
};

/** Lấy hồ sơ cơ bản của tài khoản Instagram. */
const getProfile = async (token: string): Promise<InstagramProfile> => {
  const url =
    `${GRAPH_BASE}/me` +
    `?fields=user_id,username,name,profile_picture_url` +
    `&access_token=${encodeURIComponent(token)}`;
  const data = await getJson<{
    user_id?: string;
    id?: string;
    username: string;
    name?: string;
    profile_picture_url?: string;
  }>(url, 'profile');
  return {
    id: String(data.user_id ?? data.id ?? ''),
    username: data.username,
    name: data.name ?? null,
    picture: data.profile_picture_url ?? null,
  };
};

/**
 * Luồng kết nối hoàn chỉnh (server-side): code -> long-lived token -> hồ sơ.
 * Token KHÔNG bao giờ đi qua client.
 */
export const connectWithCode = async (
  code: string,
  redirectUri: string,
): Promise<{ profile: InstagramProfile; token: InstagramTokenResult }> => {
  const short = await exchangeCodeForToken(code, redirectUri);
  const token = await getLongLivedToken(short.accessToken);
  const profile = await getProfile(token.accessToken);
  return { profile, token };
};

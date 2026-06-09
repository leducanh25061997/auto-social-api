import { createHmac } from 'crypto';

import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';

/**
 * Lớp mỏng gọi Facebook Graph API. Mọi hàm đều:
 * - Bọc try/catch để KHÔNG làm sập tiến trình.
 * - Ném `ApiError` với thông báo tiếng Việt thân thiện (không lộ chi tiết kỹ thuật).
 * - Ném lỗi 401 RIÊNG khi token hết hạn/thu hồi (Graph code 190) để job refresh
 *   biết mà tạm dừng tài khoản.
 */

const GRAPH_BASE = `https://graph.facebook.com/${env.FACEBOOK_GRAPH_VERSION}`;

/** Đã cấu hình App ID + Secret hay chưa. */
export const isFacebookConfigured = (): boolean =>
  Boolean(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET);

/** Đảm bảo đã cấu hình; nếu chưa -> báo lỗi thân thiện cho người dùng cuối. */
export const assertFacebookConfigured = (): void => {
  if (!isFacebookConfigured()) {
    throw ApiError.badRequest(
      'Tính năng kết nối Facebook chưa được cấu hình. Vui lòng liên hệ quản trị viên.',
    );
  }
};

/** appsecret_proof = HMAC-SHA256(access_token, app_secret) — Graph yêu cầu khi bật. */
const appsecretProof = (token: string): string =>
  createHmac('sha256', env.FACEBOOK_APP_SECRET).update(token).digest('hex');

interface GraphErrorBody {
  error?: { message?: string; code?: number; type?: string };
}

/** Gọi 1 URL Graph và trả JSON đã parse; chuẩn hoá lỗi thành ApiError. */
const callGraph = async <T>(url: string, action: string): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    logger.warn({ err, action }, 'Facebook Graph: lỗi mạng');
    throw ApiError.badRequest('Không kết nối được tới Facebook. Vui lòng thử lại sau.');
  }

  const body = (await res.json().catch(() => null)) as (T & GraphErrorBody) | null;

  if (!res.ok || !body || (body as GraphErrorBody).error) {
    const code = (body as GraphErrorBody | null)?.error?.code;
    logger.warn({ action, status: res.status, code }, 'Facebook Graph: bị từ chối');
    // 190 = token hết hạn / bị thu hồi / không hợp lệ.
    if (code === 190) {
      throw new ApiError(401, 'Phiên Facebook đã hết hạn. Vui lòng kết nối lại tài khoản.');
    }
    throw ApiError.badRequest(
      'Facebook từ chối yêu cầu. Vui lòng thử lại hoặc kết nối lại tài khoản.',
    );
  }

  return body as T;
};

export interface FacebookTokenResult {
  accessToken: string;
  /** Số giây còn hiệu lực (có thể undefined với token không hết hạn). */
  expiresIn?: number;
}

export interface FacebookProfile {
  id: string;
  name: string;
  picture: string | null;
}

export interface FacebookPage {
  id: string;
  name: string;
  picture: string | null;
  category: string | null;
}

/** Đổi `code` (từ OAuth dialog) lấy short-lived token. */
const exchangeCodeForToken = async (
  code: string,
  redirectUri: string,
): Promise<string> => {
  const url =
    `${GRAPH_BASE}/oauth/access_token` +
    `?client_id=${encodeURIComponent(env.FACEBOOK_APP_ID)}` +
    `&client_secret=${encodeURIComponent(env.FACEBOOK_APP_SECRET)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code=${encodeURIComponent(code)}`;
  const data = await callGraph<{ access_token: string }>(url, 'exchange-code');
  return data.access_token;
};

/** Đổi short-lived token -> long-lived token (sống ~60 ngày). */
const getLongLivedToken = async (token: string): Promise<FacebookTokenResult> => {
  const url =
    `${GRAPH_BASE}/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(env.FACEBOOK_APP_ID)}` +
    `&client_secret=${encodeURIComponent(env.FACEBOOK_APP_SECRET)}` +
    `&fb_exchange_token=${encodeURIComponent(token)}`;
  const data = await callGraph<{ access_token: string; expires_in?: number }>(
    url,
    'long-lived-token',
  );
  return {
    accessToken: data.access_token,
    // exactOptionalPropertyTypes: chỉ gán khi có giá trị, không gán undefined.
    ...(data.expires_in !== undefined ? { expiresIn: data.expires_in } : {}),
  };
};

/** Gia hạn long-lived token hiện có (dùng cho job refresh định kỳ). */
export const extendToken = (token: string): Promise<FacebookTokenResult> =>
  getLongLivedToken(token);

/** Lấy hồ sơ cơ bản của người dùng đang sở hữu token. */
const getProfile = async (token: string): Promise<FacebookProfile> => {
  const url =
    `${GRAPH_BASE}/me` +
    `?fields=id,name,picture.type(large)` +
    `&access_token=${encodeURIComponent(token)}` +
    `&appsecret_proof=${appsecretProof(token)}`;
  const data = await callGraph<{
    id: string;
    name: string;
    picture?: { data?: { url?: string } };
  }>(url, 'profile');
  return {
    id: data.id,
    name: data.name,
    picture: data.picture?.data?.url ?? null,
  };
};

/**
 * Luồng kết nối hoàn chỉnh (server-side): code -> long-lived token -> hồ sơ.
 * Token KHÔNG bao giờ đi qua client.
 */
export const connectWithCode = async (
  code: string,
  redirectUri: string,
): Promise<{ profile: FacebookProfile; token: FacebookTokenResult }> => {
  const shortToken = await exchangeCodeForToken(code, redirectUri);
  const token = await getLongLivedToken(shortToken);
  const profile = await getProfile(token.accessToken);
  return { profile, token };
};

/** Lấy danh sách Page mà tài khoản này là quản trị viên. */
export const getPages = async (token: string): Promise<FacebookPage[]> => {
  const url =
    `${GRAPH_BASE}/me/accounts` +
    `?fields=id,name,category,picture{url}` +
    `&limit=100` +
    `&access_token=${encodeURIComponent(token)}` +
    `&appsecret_proof=${appsecretProof(token)}`;
  const data = await callGraph<{
    data?: Array<{
      id: string;
      name: string;
      category?: string;
      picture?: { data?: { url?: string } };
    }>;
  }>(url, 'pages');
  return (data.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category ?? null,
    picture: p.picture?.data?.url ?? null,
  }));
};

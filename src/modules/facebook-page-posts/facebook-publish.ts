import { createReadStream, existsSync, statSync } from 'fs';
import path from 'path';

import sharp from 'sharp';

import {
  GRAPH_BASE,
  appsecretProof,
} from '../facebook-accounts/facebook-graph';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';
import type { FacebookPagePostImage } from '../../models/types';

/**
 * Lớp đăng bài lên Facebook Page (feed + reel) qua Graph API.
 * - Dùng `fetch` (global, Node 18+) + `sharp` (nén ảnh) — không thêm axios.
 * - Ảnh được nén & upload BINARY trực tiếp (ổn định hơn upload-by-url, và đảm bảo
 *   luôn ≤ giới hạn của Facebook).
 * - Mọi lỗi gói thành thông báo dễ đọc; lỗi token (code 190) → 401 để job biết.
 */

const MAX_IMAGES = 10;
const MAX_IMAGE_DIMENSION = 2048; // cạnh dài tối đa sau khi nén (px)
const REEL_FINISH_MAX_POLL = 30; // 30 × 2s = 60s chờ FB encode

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const normalizePath = (p: string): string => (p ? p.replace(/\\/g, '/') : '');

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string };
}

/** Gói lỗi Graph thành thông báo tiếng Việt; ném 401 riêng khi token chết. */
const throwGraphError = (body: GraphErrorBody | null, action: string): never => {
  const code = body?.error?.code;
  logger.warn({ action, code, subcode: body?.error?.error_subcode }, 'Facebook publish: bị từ chối');
  if (code === 190) {
    throw new ApiError(401, 'Phiên Facebook đã hết hạn. Vui lòng kết nối lại tài khoản.');
  }
  const userMsg = body?.error?.error_user_msg;
  throw ApiError.badRequest(
    userMsg || 'Facebook từ chối yêu cầu đăng bài. Vui lòng thử lại hoặc kết nối lại tài khoản.',
  );
};

/** POST tới Graph và parse JSON; chuẩn hoá lỗi. */
const graphPost = async <T>(
  url: string,
  body: FormData | URLSearchParams,
  action: string,
): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', body });
  } catch (err) {
    logger.warn({ err, action }, 'Facebook publish: lỗi mạng');
    throw ApiError.badRequest('Không kết nối được tới Facebook. Vui lòng thử lại sau.');
  }
  const json = (await res.json().catch(() => null)) as (T & GraphErrorBody) | null;
  if (!res.ok || !json || (json as GraphErrorBody).error) {
    throwGraphError(json as GraphErrorBody | null, action);
  }
  return json as T;
};

/** Nén 1 ảnh local về JPEG ≤ MAX_IMAGE_DIMENSION (q82) trong bộ nhớ. */
const compressToBuffer = async (
  imagePath: string,
): Promise<{ buffer: Buffer; filename: string } | null> => {
  try {
    if (!imagePath) return null;
    const cleanPath = normalizePath(imagePath).replace(/^\.?\//, '');
    const absPath = path.resolve(cleanPath);
    if (!existsSync(absPath)) return null;
    const buffer = await sharp(absPath)
      .rotate() // tôn trọng EXIF orientation
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const base = path.basename(absPath, path.extname(absPath));
    return { buffer, filename: `${base}.jpg` };
  } catch (err) {
    logger.warn({ err }, 'compressToBuffer thất bại');
    return null;
  }
};

export interface PublishResult {
  postId: string;
  permalinkUrl: string;
}

/** Chuẩn hoá permalink (Graph đôi khi trả relative path). */
const normalizePermalink = (permalink: string, pageId: string, postId: string): string => {
  let url = permalink;
  if (url && !/^https?:\/\//i.test(url)) {
    url = `https://www.facebook.com${url.startsWith('/') ? '' : '/'}${url}`;
  }
  if (!url && postId) {
    const suffix = String(postId).split('_')[1] || postId;
    url = `https://www.facebook.com/${pageId}/posts/${suffix}`;
  }
  return url;
};

/**
 * Đăng bài feed (text + nhiều ảnh) lên Page.
 * Mỗi ảnh → 1 photo container chưa publish; gắn tất cả vào /feed qua attached_media.
 */
export const publishToFacebookPage = async ({
  pageId,
  pageAccessToken,
  message,
  images,
}: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  images: FacebookPagePostImage[];
}): Promise<PublishResult> => {
  if (!pageId || !pageAccessToken) {
    throw ApiError.badRequest('Thiếu thông tin Page để đăng bài.');
  }
  const proof = appsecretProof(pageAccessToken);

  const list = images
    .filter((i) => i && (i.imagePath || i.imageUrl))
    .slice(0, MAX_IMAGES);
  const mediaFbids: string[] = [];

  for (const img of list) {
    const compressed = await compressToBuffer(img.imagePath);
    let photoJson: { id?: string } | null = null;
    if (compressed) {
      const form = new FormData();
      form.append('published', 'false');
      form.append('access_token', pageAccessToken);
      form.append('appsecret_proof', proof);
      form.append(
        'source',
        new Blob([new Uint8Array(compressed.buffer)], { type: 'image/jpeg' }),
        compressed.filename,
      );
      photoJson = await graphPost<{ id?: string }>(
        `${GRAPH_BASE}/${pageId}/photos`,
        form,
        'upload-photo',
      );
    } else if (img.imageUrl) {
      const params = new URLSearchParams({
        url: img.imageUrl,
        published: 'false',
        access_token: pageAccessToken,
        appsecret_proof: proof,
      });
      photoJson = await graphPost<{ id?: string }>(
        `${GRAPH_BASE}/${pageId}/photos`,
        params,
        'upload-photo-url',
      );
    }
    if (photoJson?.id) mediaFbids.push(photoJson.id);
  }

  if (!message && !mediaFbids.length) {
    throw ApiError.badRequest('Bài viết trống — cần ít nhất nội dung hoặc 1 ảnh.');
  }

  const feedParams = new URLSearchParams({
    access_token: pageAccessToken,
    appsecret_proof: proof,
  });
  if (message) feedParams.append('message', message);
  if (mediaFbids.length) {
    feedParams.append(
      'attached_media',
      JSON.stringify(mediaFbids.map((id) => ({ media_fbid: id }))),
    );
  }

  const feedJson = await graphPost<{ id?: string }>(
    `${GRAPH_BASE}/${pageId}/feed`,
    feedParams,
    'create-feed',
  );
  const postId = feedJson.id ?? '';

  // Lấy permalink (không bắt buộc — bỏ qua nếu lỗi).
  let permalinkUrl = '';
  try {
    const permaRes = await fetch(
      `${GRAPH_BASE}/${postId}?fields=permalink_url` +
        `&access_token=${encodeURIComponent(pageAccessToken)}` +
        `&appsecret_proof=${proof}`,
    );
    const permaJson = (await permaRes.json().catch(() => null)) as
      | { permalink_url?: string }
      | null;
    permalinkUrl = permaJson?.permalink_url ?? '';
  } catch {
    // not fatal
  }

  return { postId, permalinkUrl: normalizePermalink(permalinkUrl, pageId, postId) };
};

/**
 * Đăng Reel theo flow resumable upload 3-phase của Graph API.
 * Tham chiếu: developers.facebook.com/docs/video-api/guides/reels-publishing
 */
export const publishToFacebookReel = async ({
  pageId,
  pageAccessToken,
  description,
  videoUrl,
  videoFilePath,
}: {
  pageId: string;
  pageAccessToken: string;
  description: string;
  videoUrl: string;
  videoFilePath: string;
}): Promise<PublishResult> => {
  if (!pageId || !pageAccessToken) {
    throw ApiError.badRequest('Thiếu thông tin Page để đăng reel.');
  }
  if (!videoUrl && !videoFilePath) {
    throw ApiError.badRequest('Reel cần một video (tải lên hoặc URL).');
  }
  const proof = appsecretProof(pageAccessToken);

  // Phase 1: start — lấy video_id + upload_url
  const startParams = new URLSearchParams({
    upload_phase: 'start',
    access_token: pageAccessToken,
    appsecret_proof: proof,
  });
  const start = await graphPost<{ video_id?: string; upload_url?: string }>(
    `${GRAPH_BASE}/${pageId}/video_reels`,
    startParams,
    'reel-start',
  );
  const videoId = start.video_id;
  const uploadUrl = start.upload_url;
  if (!videoId || !uploadUrl) {
    throw ApiError.badRequest('Không khởi tạo được phiên đăng reel. Vui lòng thử lại.');
  }

  // Phase 2: upload — qua URL hoặc binary stream
  try {
    if (videoUrl) {
      await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `OAuth ${pageAccessToken}`, file_url: videoUrl },
      });
    } else {
      const size = statSync(videoFilePath).size;
      // Node fetch (undici) chấp nhận Readable stream làm body; cần `duplex: 'half'`.
      const init = {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${pageAccessToken}`,
          offset: '0',
          file_size: String(size),
          'Content-Type': 'application/octet-stream',
        },
        body: createReadStream(videoFilePath),
        duplex: 'half',
      } as unknown as RequestInit;
      await fetch(uploadUrl, init);
    }
  } catch (err) {
    logger.warn({ err }, 'Reel: upload video thất bại');
    throw ApiError.badRequest('Tải video reel lên Facebook thất bại. Vui lòng thử lại.');
  }

  // Phase 3: finish — publish
  const finishParams = new URLSearchParams({
    upload_phase: 'finish',
    video_id: videoId,
    video_state: 'PUBLISHED',
    access_token: pageAccessToken,
    appsecret_proof: proof,
  });
  if (description) finishParams.append('description', description);
  await graphPost(
    `${GRAPH_BASE}/${pageId}/video_reels`,
    finishParams,
    'reel-finish',
  );

  // Poll trạng thái encode để có post_id + permalink ổn định.
  let postId = '';
  let permalinkUrl = '';
  for (let i = 0; i < REEL_FINISH_MAX_POLL; i += 1) {
    try {
      const statusRes = await fetch(
        `${GRAPH_BASE}/${videoId}?fields=status,permalink_url,post_id` +
          `&access_token=${encodeURIComponent(pageAccessToken)}` +
          `&appsecret_proof=${proof}`,
      );
      const statusJson = (await statusRes.json().catch(() => null)) as {
        status?: { video_status?: string };
        permalink_url?: string;
        post_id?: string;
      } | null;
      const phase = statusJson?.status?.video_status;
      permalinkUrl = statusJson?.permalink_url || permalinkUrl;
      postId = statusJson?.post_id || postId;
      if (phase === 'ready' || (postId && permalinkUrl)) break;
      if (phase === 'error') {
        throw ApiError.badRequest('Facebook xử lý reel thất bại. Vui lòng thử video khác.');
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // bỏ qua lỗi poll tạm thời, thử lại
    }
    await sleep(2000);
  }

  if (permalinkUrl && !/^https?:\/\//i.test(permalinkUrl)) {
    permalinkUrl = `https://www.facebook.com${permalinkUrl.startsWith('/') ? '' : '/'}${permalinkUrl}`;
  }
  if (!permalinkUrl) permalinkUrl = `https://www.facebook.com/reel/${videoId}`;

  return { postId: postId || videoId, permalinkUrl };
};

/**
 * Đăng 1 comment dưới bài/reel vừa publish (best-effort).
 * Trả về true nếu thành công. Lỗi được nuốt + log (bài đã đăng rồi nên KHÔNG
 * để comment thất bại làm hỏng cả flow).
 */
export const commentOnFacebookPost = async ({
  postId,
  pageAccessToken,
  message,
}: {
  postId: string;
  pageAccessToken: string;
  message: string;
}): Promise<boolean> => {
  const text = message?.trim();
  if (!postId || !pageAccessToken || !text) return false;
  try {
    const proof = appsecretProof(pageAccessToken);
    const params = new URLSearchParams({
      message: text,
      access_token: pageAccessToken,
      appsecret_proof: proof,
    });
    const res = await fetch(`${GRAPH_BASE}/${postId}/comments`, {
      method: 'POST',
      body: params,
    });
    const json = (await res.json().catch(() => null)) as
      | { id?: string; error?: { message?: string } }
      | null;
    if (!res.ok || !json || json.error || !json.id) {
      logger.warn(
        { postId, error: json?.error?.message },
        'Đăng comment dưới bài thất bại (bỏ qua)',
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, postId }, 'Đăng comment dưới bài thất bại (bỏ qua)');
    return false;
  }
};

/** Xoá bài viết trên Facebook (best-effort). Trả về true nếu thành công. */
export const deletePostOnFacebook = async (
  postId: string,
  pageAccessToken: string,
): Promise<boolean> => {
  if (!postId || !pageAccessToken) return false;
  try {
    const proof = appsecretProof(pageAccessToken);
    const res = await fetch(
      `${GRAPH_BASE}/${postId}?access_token=${encodeURIComponent(pageAccessToken)}` +
        `&appsecret_proof=${proof}`,
      { method: 'DELETE' },
    );
    return res.ok;
  } catch (err) {
    logger.warn({ err, postId }, 'Xoá bài trên Facebook thất bại (bỏ qua)');
    return false;
  }
};

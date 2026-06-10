import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';

import multer from 'multer';
import sharp from 'sharp';

import { env } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * Cơ chế upload ảnh/video cho bài đăng Facebook (mô phỏng social-control-api):
 * - Lưu file vào ./uploads/... rồi serve tĩnh qua express.static.
 * - Ảnh được nén lại (resize ≤2048px + JPEG q82) để vừa giới hạn của Facebook.
 * - Trả về { imagePath (tương đối), imageUrl (tuyệt đối, để FE preview) }.
 */

export const MAX_IMAGES = 10;
const MAX_IMAGE_DIMENSION = 2048;
const IMAGE_DIR = './uploads/facebook-posts';
const VIDEO_DIR = './uploads/videos';

const ensureDir = (dir: string): void => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

const normalizePath = (p: string): string => (p ? p.replace(/\\/g, '/') : '');

/** Dựng URL công khai từ đường dẫn tương đối ("./uploads/x" → "<host>/uploads/x"). */
export const buildPublicUrl = (relPath: string): string => {
  if (!relPath) return '';
  const clean = normalizePath(relPath).replace(/^\.?\//, '');
  return `${env.API_PUBLIC_URL.replace(/\/$/, '')}/${clean}`;
};

// ── Multer storage ───────────────────────────────────────────────────────────

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureDir(IMAGE_DIR);
      cb(null, IMAGE_DIR);
    } catch (err) {
      cb(err as Error, IMAGE_DIR);
    }
  },
  filename: (_req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || 'jpg')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}.${ext || 'jpg'}`);
  },
});

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureDir(VIDEO_DIR);
      cb(null, VIDEO_DIR);
    } catch (err) {
      cb(err as Error, VIDEO_DIR);
    }
  },
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});

/** Upload tối đa 10 ảnh (field `images`), 30MB/ảnh trước khi nén. */
export const uploadImagesMiddleware = multer({
  storage: imageStorage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
}).array('images', MAX_IMAGES);

/** Upload 1 video (field `video`), tối đa 1GB. */
export const uploadVideoMiddleware = multer({
  storage: videoStorage,
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('video/')),
}).single('video');

// ── Sharp compression ──────────────────────────────────────────────────────

/**
 * Nén 1 ảnh đã upload về JPEG ≤ MAX_IMAGE_DIMENSION. Ghi đè file gốc bằng .jpg,
 * trả về đường dẫn tương đối mới. Lỗi → trả lại path gốc (fallback).
 */
export const compressImage = async (relPath: string): Promise<string> => {
  try {
    const absPath = path.resolve(relPath);
    if (!existsSync(absPath)) return normalizePath(relPath);
    const dir = path.dirname(absPath);
    const base = path.basename(absPath, path.extname(absPath));
    const outAbs = path.join(dir, `${base}.jpg`);
    const buffer = await sharp(absPath)
      .rotate()
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    writeFileSync(outAbs, buffer);
    if (path.resolve(outAbs) !== absPath) {
      try {
        unlinkSync(absPath);
      } catch {
        /* ignore */
      }
    }
    return normalizePath(path.relative(process.cwd(), outAbs));
  } catch (err) {
    logger.warn({ err }, 'compressImage thất bại — dùng ảnh gốc');
    return normalizePath(relPath);
  }
};

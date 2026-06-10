import mongoose, { Schema, model, type Model } from 'mongoose';

/**
 * Một bài đăng lên Facebook Page (feed có ảnh hoặc reel video).
 *
 * Trạng thái vòng đời:
 *   draft → (đăng ngay) processing → published / failed
 *   draft → (lên lịch) scheduled → (tới giờ) processing → published / failed
 *
 * `fbUserId` được denormalize từ tài khoản để bài viết "sống sót" khi người dùng
 * xoá rồi kết nối lại cùng tài khoản Meta (lúc đó account sinh `_id` mới, nhưng
 * fbUserId giữ nguyên → job vẫn tìm được tài khoản để đăng).
 */
export interface FacebookPagePostImage {
  imagePath: string;
  imageUrl: string;
}

export type FacebookPostType = 'feed' | 'reel';
export type FacebookPostStatus =
  | 'draft'
  | 'scheduled'
  | 'processing'
  | 'published'
  | 'failed';

export interface FacebookPagePostDoc {
  facebookAccountId: mongoose.Types.ObjectId;
  /** Facebook UID của tài khoản (denormalized, sống sót qua delete+reconnect). */
  fbUserId: string;
  pageId: string;
  pageName: string;
  postType: FacebookPostType;
  message: string;
  /** Nội dung comment tự đăng dưới bài ngay sau khi publish (tuỳ chọn). */
  firstComment: string;
  /** Ảnh cho bài feed (tối đa 10). Reel không dùng. */
  images: FacebookPagePostImage[];
  /** Video cho reel (đường dẫn local đã upload). */
  videoPath: string;
  /** Hoặc URL video công khai (thay cho upload file). */
  videoUrl: string;
  status: FacebookPostStatus;
  scheduledAt: Date | null;
  timezone: string;
  retryCount: number;
  /** id bài viết Facebook sau khi đăng. */
  postId: string;
  permalinkUrl: string;
  errorMessage: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const imageSubSchema = new Schema<FacebookPagePostImage>(
  {
    imagePath: { type: String, trim: true, default: '' },
    imageUrl: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const facebookPagePostSchema = new Schema<FacebookPagePostDoc>(
  {
    facebookAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'FacebookAccount',
      required: true,
      index: true,
    },
    fbUserId: { type: String, trim: true, default: '', index: true },
    pageId: { type: String, required: true, trim: true },
    pageName: { type: String, trim: true, default: '' },
    postType: { type: String, enum: ['feed', 'reel'], default: 'feed', index: true },
    message: { type: String, trim: true, default: '' },
    firstComment: { type: String, trim: true, default: '' },
    images: { type: [imageSubSchema], default: [] },
    videoPath: { type: String, trim: true, default: '' },
    videoUrl: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'processing', 'published', 'failed'],
      default: 'draft',
      index: true,
    },
    scheduledAt: { type: Date, default: null, index: true },
    timezone: { type: String, trim: true, default: 'Asia/Ho_Chi_Minh' },
    retryCount: { type: Number, default: 0 },
    postId: { type: String, trim: true, default: '' },
    permalinkUrl: { type: String, trim: true, default: '' },
    errorMessage: { type: String, trim: true, default: '' },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'facebook_page_posts' },
);

// Guard tránh OverwriteModelError khi module được nạp lại (test/hot-reload).
export const FacebookPagePostModel: Model<FacebookPagePostDoc> =
  (mongoose.models.FacebookPagePost as Model<FacebookPagePostDoc>) ??
  model<FacebookPagePostDoc>('FacebookPagePost', facebookPagePostSchema);

import { z } from 'zod';

/**
 * BƯỚC 1 — Đổi code lấy hồ sơ để XEM TRƯỚC. FE gửi `code` (từ OAuth dialog) +
 * `redirectUri` đã dùng. Backend đổi code -> token, lấy hồ sơ, lưu TẠM (token không
 * đi qua FE) và trả về hồ sơ + `pendingId`.
 */
export const exchangeFacebookSchema = z.object({
  code: z.string().min(1, 'Thiếu mã xác thực Facebook'),
  redirectUri: z.string().url('redirectUri không hợp lệ'),
})

/**
 * BƯỚC 2 — Xác nhận tạo tài khoản từ `pendingId` (của bước 1). Có thể đặt tên hiển thị.
 */
export const connectFacebookSchema = z.object({
  pendingId: z.string().min(1, 'Thiếu mã phiên kết nối'),
  name: z.string().trim().min(1).max(100).optional(),
});

/** Query phân trang + lọc danh sách tài khoản. */
export const listFacebookAccountsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

/** Cập nhật tài khoản: đổi tên hiển thị và/hoặc bật-tắt. Cần ít nhất 1 trường. */
export const updateFacebookAccountSchema = z
  .object({
    name: z.string().trim().min(1, 'Tên không được để trống').max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Cần ít nhất một trường để cập nhật',
  });

export const facebookAccountIdParamSchema = z.object({
  id: z.string().min(1),
});

export type ExchangeFacebookInput = z.infer<typeof exchangeFacebookSchema>;
export type ConnectFacebookInput = z.infer<typeof connectFacebookSchema>;
export type ListFacebookAccountsQuery = z.infer<typeof listFacebookAccountsSchema>;
export type UpdateFacebookAccountInput = z.infer<typeof updateFacebookAccountSchema>;
export type FacebookAccountIdParam = z.infer<typeof facebookAccountIdParamSchema>;

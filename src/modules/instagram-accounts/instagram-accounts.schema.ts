import { z } from 'zod';

/**
 * BƯỚC 1 — Đổi code lấy hồ sơ để XEM TRƯỚC. Backend đổi code -> token, lấy hồ sơ,
 * lưu TẠM (token không đi qua FE) và trả về hồ sơ + `pendingId`.
 */
export const exchangeInstagramSchema = z.object({
  code: z.string().min(1, 'Thiếu mã xác thực Instagram'),
  redirectUri: z.string().url('redirectUri không hợp lệ'),
})

/** BƯỚC 2 — Xác nhận tạo tài khoản từ `pendingId`. Có thể đặt tên hiển thị. */
export const connectInstagramSchema = z.object({
  pendingId: z.string().min(1, 'Thiếu mã phiên kết nối'),
  name: z.string().trim().min(1).max(100).optional(),
});

/** Query phân trang + lọc danh sách tài khoản. */
export const listInstagramAccountsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

/** Cập nhật tài khoản: đổi tên hiển thị và/hoặc bật-tắt. Cần ít nhất 1 trường. */
export const updateInstagramAccountSchema = z
  .object({
    name: z.string().trim().min(1, 'Tên không được để trống').max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Cần ít nhất một trường để cập nhật',
  });

export const instagramAccountIdParamSchema = z.object({
  id: z.string().min(1),
});

export type ExchangeInstagramInput = z.infer<typeof exchangeInstagramSchema>;
export type ConnectInstagramInput = z.infer<typeof connectInstagramSchema>;
export type ListInstagramAccountsQuery = z.infer<typeof listInstagramAccountsSchema>;
export type UpdateInstagramAccountInput = z.infer<typeof updateInstagramAccountSchema>;
export type InstagramAccountIdParam = z.infer<typeof instagramAccountIdParamSchema>;

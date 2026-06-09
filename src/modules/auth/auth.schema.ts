import { z } from 'zod';

const usernameField = z
  .string()
  .min(3, 'Username tối thiểu 3 ký tự')
  .max(32, 'Username tối đa 32 ký tự')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username chỉ gồm chữ, số và dấu gạch dưới')
  .toLowerCase();

export const registerSchema = z.object({
  username: usernameField,
  name: z.string().min(1).max(100).optional(),
  password: z
    .string()
    .min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .max(128)
    .regex(/[a-z]/, 'Cần ít nhất 1 chữ thường')
    .regex(/[A-Z]/, 'Cần ít nhất 1 chữ hoa')
    .regex(/[0-9]/, 'Cần ít nhất 1 chữ số'),
});

export const loginSchema = z.object({
  username: usernameField,
  password: z.string().min(1, 'Mật khẩu là bắt buộc'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken là bắt buộc'),
});

/** Cập nhật hồ sơ của chính mình (name, email). Ít nhất 1 trường. */
export const updateMeSchema = z
  .object({
    name: z.string().min(1).max(100).nullable().optional(),
    email: z.string().email('Email không hợp lệ').max(255).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Cần ít nhất một trường để cập nhật',
  });

/** Đổi mật khẩu của chính mình: cần mật khẩu hiện tại + mật khẩu mới hợp lệ. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mật khẩu hiện tại là bắt buộc'),
  newPassword: z
    .string()
    .min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .max(128)
    .regex(/[a-z]/, 'Cần ít nhất 1 chữ thường')
    .regex(/[A-Z]/, 'Cần ít nhất 1 chữ hoa')
    .regex(/[0-9]/, 'Cần ít nhất 1 chữ số'),
});

// Type suy luận trực tiếp từ Zod — đồng bộ giữa validate và service.
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

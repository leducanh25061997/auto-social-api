import { z } from 'zod';

/** Tái dùng ràng buộc username/password đồng bộ với module auth. */
const usernameField = z
  .string()
  .min(3, 'Username tối thiểu 3 ký tự')
  .max(32, 'Username tối đa 32 ký tự')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username chỉ gồm chữ, số và dấu gạch dưới')
  .toLowerCase();

const passwordField = z
  .string()
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(128)
  .regex(/[a-z]/, 'Cần ít nhất 1 chữ thường')
  .regex(/[A-Z]/, 'Cần ít nhất 1 chữ hoa')
  .regex(/[0-9]/, 'Cần ít nhất 1 chữ số');

const emailField = z.string().email('Email không hợp lệ').max(255);
const nameField = z.string().min(1).max(100);
const roleField = z.enum(['USER', 'ADMIN']);

/** Query phân trang + lọc cho danh sách user. */
export const listUsersSchema = z.object({
  // coerce vì query string luôn là string.
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional(),
  role: roleField.optional(),
});

export const createUserSchema = z.object({
  username: usernameField,
  name: nameField.optional(),
  email: emailField.optional(),
  password: passwordField,
  role: roleField.default('USER'),
});

/** Cập nhật user (admin): chỉ các field cho phép sửa, tất cả optional. */
export const updateUserSchema = z
  .object({
    name: nameField.nullable().optional(),
    email: emailField.nullable().optional(),
    role: roleField.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Cần ít nhất một trường để cập nhật',
  });

/** Admin đặt lại mật khẩu cho user. */
export const resetPasswordSchema = z.object({
  password: passwordField,
});

export const userIdParamSchema = z.object({
  id: z.string().min(1),
});

export type ListUsersQuery = z.infer<typeof listUsersSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;

import type { User } from '../../models/types';
import { usersRepository } from './users.repository';
import { authRepository } from '../auth/auth.repository';
import type { SafeUser } from '../auth/auth.service';
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from './users.schema';
import { hashPassword } from '../../utils/hashing';
import { ApiError } from '../../utils/ApiError';

const toSafeUser = (user: User): SafeUser => {
  const { password: _password, ...safe } = user;
  return safe;
};

export interface PaginatedUsers {
  items: SafeUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const usersService = {
  async list(query: ListUsersQuery): Promise<PaginatedUsers> {
    const { items, total } = await usersRepository.list(query);
    return {
      items: items.map(toSafeUser),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  },

  async getById(id: string): Promise<SafeUser> {
    const user = await usersRepository.findById(id);
    if (!user) throw ApiError.notFound('Không tìm thấy người dùng');
    return toSafeUser(user);
  },

  async create(input: CreateUserInput): Promise<SafeUser> {
    if (await usersRepository.findByUsername(input.username)) {
      throw ApiError.conflict('Username đã tồn tại');
    }
    if (input.email && (await usersRepository.findByEmail(input.email))) {
      throw ApiError.conflict('Email đã được sử dụng');
    }

    const password = await hashPassword(input.password);
    const user = await usersRepository.create({
      username: input.username,
      name: input.name ?? null,
      email: input.email ?? null,
      password,
      role: input.role,
    });
    return toSafeUser(user);
  },

  async update(id: string, input: UpdateUserInput): Promise<SafeUser> {
    const existing = await usersRepository.findById(id);
    if (!existing) throw ApiError.notFound('Không tìm thấy người dùng');

    // Đổi email -> đảm bảo không trùng user khác.
    if (input.email) {
      const owner = await usersRepository.findByEmail(input.email);
      if (owner && owner.id !== id) {
        throw ApiError.conflict('Email đã được sử dụng');
      }
    }

    const user = await usersRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
    });
    return toSafeUser(user);
  },

  /** Xoá user. Chặn admin tự xoá chính mình để tránh khoá hệ thống. */
  async remove(id: string, requesterId: string): Promise<void> {
    if (id === requesterId) {
      throw ApiError.badRequest('Không thể xoá chính tài khoản của bạn');
    }
    const existing = await usersRepository.findById(id);
    if (!existing) throw ApiError.notFound('Không tìm thấy người dùng');
    await usersRepository.delete(id);
  },

  /** Admin đặt lại mật khẩu + thu hồi toàn bộ phiên của user (buộc đăng nhập lại). */
  async resetPassword(id: string, newPassword: string): Promise<void> {
    const existing = await usersRepository.findById(id);
    if (!existing) throw ApiError.notFound('Không tìm thấy người dùng');

    const password = await hashPassword(newPassword);
    await usersRepository.update(id, { password });
    await authRepository.revokeAllForUser(id);
  },
};

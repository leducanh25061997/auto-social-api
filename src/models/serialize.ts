/**
 * Chuyển document Mongoose (kết quả `.lean()` hoặc `.toObject()`) thành entity
 * phẳng dùng trong service: đổi `_id` -> `id` (string), loại bỏ `__v`.
 * Nhờ vậy service có thể dùng `{ password, ...rest }` an toàn và đọc `entity.id`.
 */
export const serialize = <T>(doc: unknown): T | null => {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc as Record<string, unknown> & { _id: unknown };
  return { id: String(_id), ...rest } as T;
};

export const serializeMany = <T>(docs: unknown[]): T[] =>
  docs.map((d) => serialize<T>(d) as T);

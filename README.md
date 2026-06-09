# auto-social-api

REST API hiệu năng cao — **Node + TypeScript (strict) + Express + Prisma + Zod + JWT**.
Kiến trúc Feature-based & Layered (Route → Controller → Service → Repository).

## Cấu trúc

```
src/
├── config/          # env (validate bằng Zod), db (Prisma singleton)
├── middlewares/     # errorHandler, requireAuth, validate, rateLimiter
├── modules/
│   └── auth/        # auth.routes | controller | service | repository | schema
├── utils/           # logger, ApiError, catchAsync, hashing (argon2), jwt
├── types/           # mở rộng Express.Request
├── routes.ts        # router tổng (đăng ký mọi module)
├── app.ts           # tạo Express app + middlewares
└── server.ts        # bootstrap + graceful shutdown
```

## Bắt đầu

```bash
npm install
cp .env.example .env        # điền DATABASE_URL & JWT secrets
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed         # tạo admin mặc định (adminleducanh / Leducanh25@)
npm run dev
```

> **Production deploy:** chạy `npm run db:deploy` (= `prisma migrate deploy && prisma db seed`).
> Seed dùng `upsert` nên an toàn chạy lại nhiều lần — tự tạo admin nếu chưa có, không ghi đè nếu đã có.
> Có thể override bằng ENV `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

## API hiện có (`/api/v1`)

| Method | Endpoint         | Mô tả                                   | Auth   |
|--------|------------------|-----------------------------------------|--------|
| POST   | `/auth/register` | Đăng ký bằng **username** + nhận token   | —      |
| POST   | `/auth/login`    | Đăng nhập bằng **username** + nhận token | —      |
| POST   | `/auth/refresh`  | Xoay vòng (rotation) access/refresh token | —    |
| POST   | `/auth/logout`   | Thu hồi refresh token hiện tại           | —      |
| GET    | `/auth/me`       | Thông tin user hiện tại                  | Bearer |
| GET    | `/health`        | Health check                            | —      |

> **Auth dùng `username`, không dùng email.** Refresh token được lưu (đã hash SHA-256) trong bảng
> `refresh_tokens`: mỗi lần `/auth/refresh` sẽ thu hồi token cũ và cấp token mới (rotation);
> nếu một token đã thu hồi bị dùng lại, toàn bộ token của user bị vô hiệu (reuse detection).

Mọi response thành công: `{ status: 'success', data: ... }`.
Mọi lỗi: `{ status, message, errors? }` (qua Global Error Handler).

## Thêm module mới

1. Tạo `src/modules/<name>/` với 4 file: `routes`, `controller`, `service`, `schema` (+ `repository` nếu cần).
2. Đăng ký trong `src/routes.ts`: `router.use('/<name>', <name>Routes)`.
3. Validate input bằng Zod ở route; controller bọc `catchAsync`; logic ở service.

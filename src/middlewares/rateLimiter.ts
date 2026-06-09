import rateLimit from 'express-rate-limit';

/** Rate limit chung cho toàn API. */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many requests, please try again later.' },
});

/** Rate limit chặt hơn cho các endpoint nhạy cảm (login/register). */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many auth attempts, please try again later.' },
});

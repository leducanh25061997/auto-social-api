import { Router } from 'express';
import { authController } from './auth.controller';
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  updateMeSchema,
} from './auth.schema';
import { validate } from '../../middlewares/validate';
import { requireAuth } from '../../middlewares/requireAuth';
import { authRateLimiter } from '../../middlewares/rateLimiter';

const router = Router();

router.post('/register', authRateLimiter, validate({ body: registerSchema }), authController.register);
router.post('/login', authRateLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', validate({ body: refreshSchema }), authController.refresh);
router.post('/logout', validate({ body: refreshSchema }), authController.logout);
router.get('/me', requireAuth, authController.me);
router.patch('/me', requireAuth, validate({ body: updateMeSchema }), authController.updateMe);
router.post(
  '/change-password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  authController.changePassword,
);

export const authRoutes = router;

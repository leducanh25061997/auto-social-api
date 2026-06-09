import { Router } from 'express';
import { authRoutes } from './modules/auth/auth.routes';
import { usersRoutes } from './modules/users/users.routes';
import { facebookAccountsRoutes } from './modules/facebook-accounts/facebook-accounts.routes';
import { instagramAccountsRoutes } from './modules/instagram-accounts/instagram-accounts.routes';

/**
 * Router tổng — đăng ký mọi module feature tại đây.
 * Thêm module mới: import routes của nó rồi router.use('/<prefix>', xxxRoutes).
 */
const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/facebook-accounts', facebookAccountsRoutes);
router.use('/instagram-accounts', instagramAccountsRoutes);

export const apiRouter = router;

import { Router } from 'express';

import { instagramAccountsController } from './instagram-accounts.controller';
import {
  connectInstagramSchema,
  exchangeInstagramSchema,
  instagramAccountIdParamSchema,
  listInstagramAccountsSchema,
  updateInstagramAccountSchema,
} from './instagram-accounts.schema';
import { validate } from '../../middlewares/validate';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

// Mọi route quản lý tài khoản Instagram đều cần đăng nhập.
router.use(requireAuth);

router.post(
  '/exchange',
  validate({ body: exchangeInstagramSchema }),
  instagramAccountsController.exchange,
);

router.post(
  '/connect',
  validate({ body: connectInstagramSchema }),
  instagramAccountsController.connect,
);

router.get(
  '/',
  validate({ query: listInstagramAccountsSchema }),
  instagramAccountsController.list,
);

router.get(
  '/:id',
  validate({ params: instagramAccountIdParamSchema }),
  instagramAccountsController.getById,
);

router.patch(
  '/:id',
  validate({ params: instagramAccountIdParamSchema, body: updateInstagramAccountSchema }),
  instagramAccountsController.update,
);

router.post(
  '/:id/refresh',
  validate({ params: instagramAccountIdParamSchema }),
  instagramAccountsController.refresh,
);

router.delete(
  '/:id',
  validate({ params: instagramAccountIdParamSchema }),
  instagramAccountsController.remove,
);

export const instagramAccountsRoutes = router;

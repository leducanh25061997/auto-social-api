import { Router } from 'express';

import { facebookAccountsController } from './facebook-accounts.controller';
import {
  connectFacebookSchema,
  exchangeFacebookSchema,
  facebookAccountIdParamSchema,
  listFacebookAccountsSchema,
  updateFacebookAccountSchema,
} from './facebook-accounts.schema';
import { validate } from '../../middlewares/validate';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

// Mọi route quản lý tài khoản Facebook đều cần đăng nhập.
router.use(requireAuth);

router.post(
  '/exchange',
  validate({ body: exchangeFacebookSchema }),
  facebookAccountsController.exchange,
);

router.post(
  '/connect',
  validate({ body: connectFacebookSchema }),
  facebookAccountsController.connect,
);

router.get(
  '/',
  validate({ query: listFacebookAccountsSchema }),
  facebookAccountsController.list,
);

router.get(
  '/:id',
  validate({ params: facebookAccountIdParamSchema }),
  facebookAccountsController.getById,
);

router.get(
  '/:id/pages',
  validate({ params: facebookAccountIdParamSchema }),
  facebookAccountsController.listPages,
);

router.patch(
  '/:id',
  validate({ params: facebookAccountIdParamSchema, body: updateFacebookAccountSchema }),
  facebookAccountsController.update,
);

router.post(
  '/:id/refresh',
  validate({ params: facebookAccountIdParamSchema }),
  facebookAccountsController.refresh,
);

router.delete(
  '/:id',
  validate({ params: facebookAccountIdParamSchema }),
  facebookAccountsController.remove,
);

export const facebookAccountsRoutes = router;

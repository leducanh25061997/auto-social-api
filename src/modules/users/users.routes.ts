import { Router } from 'express';
import { usersController } from './users.controller';
import {
  createUserSchema,
  listUsersSchema,
  resetPasswordSchema,
  updateUserSchema,
  userIdParamSchema,
} from './users.schema';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/requireAuth';

const router = Router();

// Toàn bộ resource users chỉ dành cho ADMIN.
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate({ query: listUsersSchema }), usersController.list);
router.post('/', validate({ body: createUserSchema }), usersController.create);
router.get('/:id', validate({ params: userIdParamSchema }), usersController.getById);
router.patch(
  '/:id',
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  usersController.update,
);
router.delete('/:id', validate({ params: userIdParamSchema }), usersController.remove);
router.post(
  '/:id/reset-password',
  validate({ params: userIdParamSchema, body: resetPasswordSchema }),
  usersController.resetPassword,
);

export const usersRoutes = router;

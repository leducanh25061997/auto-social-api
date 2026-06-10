import { Router } from 'express';

import { facebookPagePostsController } from './facebook-page-posts.controller';
import {
  createFacebookPostSchema,
  deleteFacebookPostSchema,
  facebookPostIdParamSchema,
  generateCommentSchema,
  listFacebookPostsSchema,
  rescheduleFacebookPostSchema,
  updateFacebookPostSchema,
} from './facebook-page-posts.schema';
import { uploadImagesMiddleware, uploadVideoMiddleware } from './facebook-uploads';
import { validate } from '../../middlewares/validate';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

// Mọi route quản lý bài đăng đều cần đăng nhập.
router.use(requireAuth);

// Upload (multipart) — multer chạy trước controller. Đặt trước route '/:id'.
router.post('/upload-images', uploadImagesMiddleware, facebookPagePostsController.uploadImages);
router.post('/upload-video', uploadVideoMiddleware, facebookPagePostsController.uploadVideo);

// Gợi ý comment bằng AI — đặt trước route '/:id'.
router.post(
  '/generate-comment',
  validate({ body: generateCommentSchema }),
  facebookPagePostsController.generateComment,
);

router.get('/', validate({ query: listFacebookPostsSchema }), facebookPagePostsController.list);
router.post('/', validate({ body: createFacebookPostSchema }), facebookPagePostsController.create);

router.get(
  '/:id',
  validate({ params: facebookPostIdParamSchema }),
  facebookPagePostsController.getById,
);
router.patch(
  '/:id',
  validate({ params: facebookPostIdParamSchema, body: updateFacebookPostSchema }),
  facebookPagePostsController.update,
);
router.delete(
  '/:id',
  validate({ params: facebookPostIdParamSchema, body: deleteFacebookPostSchema }),
  facebookPagePostsController.remove,
);

router.post(
  '/:id/publish',
  validate({ params: facebookPostIdParamSchema }),
  facebookPagePostsController.publish,
);
router.post(
  '/:id/reschedule',
  validate({ params: facebookPostIdParamSchema, body: rescheduleFacebookPostSchema }),
  facebookPagePostsController.reschedule,
);
router.post(
  '/:id/cancel-schedule',
  validate({ params: facebookPostIdParamSchema }),
  facebookPagePostsController.cancelSchedule,
);

export const facebookPagePostsRoutes = router;

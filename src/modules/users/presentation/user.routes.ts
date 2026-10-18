import { Router, RequestHandler } from 'express';
import { UserController } from './user.controller.js';
import { validateRequest } from '../../../shared/validation/validate.js';
import { updateProfileSchema, listUsersQuerySchema, userIdParamSchema } from './user.validation.js';
import { authorize } from '../../auth/presentation/auth.middleware.js';

export function createUserRouter(
  userController: UserController,
  authenticate: RequestHandler
): Router {
  const router = Router();

  // All user routes require authentication
  router.use(authenticate);

  router.get('/me', userController.getMe);
  router.patch('/me', validateRequest({ body: updateProfileSchema }), userController.updateMe);

  // Admin-only paginated list
  router.get(
    '/',
    authorize('ADMIN'),
    validateRequest({ query: listUsersQuerySchema }),
    userController.listUsers
  );

  // View user by ID (admin or self)
  router.get('/:id', validateRequest({ params: userIdParamSchema }), userController.getUserById);

  return router;
}

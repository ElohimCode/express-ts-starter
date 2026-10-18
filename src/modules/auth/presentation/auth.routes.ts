import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validateRequest } from '../../../shared/validation/validate.js';
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from './auth.validation.js';
import { authRateLimiter } from '../../../shared/middleware/rate-limiter.middleware.js';
import { RequestHandler } from 'express';

export function createAuthRouter(
  authController: AuthController,
  authenticate: RequestHandler
): Router {
  const router = Router();

  router.post(
    '/register',
    authRateLimiter,
    validateRequest({ body: registerSchema }),
    authController.register
  );

  router.post(
    '/login',
    authRateLimiter,
    validateRequest({ body: loginSchema }),
    authController.login
  );

  router.post(
    '/refresh',
    authRateLimiter,
    validateRequest({ body: refreshSchema }),
    authController.refresh
  );

  router.post('/logout', validateRequest({ body: logoutSchema }), authController.logout);

  router.get('/me', authenticate, authController.me);

  return router;
}

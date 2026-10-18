import { Router } from 'express';
import { HealthController } from './health.controller.js';

export function createHealthRouter(healthController: HealthController): Router {
  const router = Router();

  router.get('/live', healthController.live);
  router.get('/ready', healthController.ready);

  return router;
}

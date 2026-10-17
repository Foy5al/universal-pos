import { Router } from 'express';

import { successEnvelope } from '@pos/contracts';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json(successEnvelope({ status: 'ok' }));
  });

  router.get('/ready', (_req, res) => {
    res.json(successEnvelope({ status: 'ready' }));
  });

  return router;
}

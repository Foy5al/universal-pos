import { Router } from 'express';

import { successEnvelope, updatePosSettingsRequestSchema } from '@pos/contracts';

import { asyncHandler } from '../http/asyncHandler';
import { requirePrincipal } from '../http/requirePrincipal';
import { authorize } from '../middleware/authorize';
import type { PosSettingsService } from '../services/posSettings';

export function createPosSettingsRouter(service: PosSettingsService): Router {
  const router = Router();

  router.get(
    '/pos/settings',
    authorize('sales:create'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      res.json(successEnvelope(await service.get(principal.organizationId)));
    }),
  );

  router.put(
    '/pos/settings',
    authorize('settings:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const input = updatePosSettingsRequestSchema.parse(req.body);
      res.json(successEnvelope(await service.update(principal.organizationId, input)));
    }),
  );

  return router;
}

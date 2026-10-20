import { Router } from 'express';

import {
  listQuerySchema,
  registerDeviceRequestSchema,
  resourceIdSchema,
  successEnvelope,
  syncPullQuerySchema,
  syncPushRequestSchema,
} from '@pos/contracts';

import { asyncHandler } from '../http/asyncHandler';
import { requirePrincipal } from '../http/requirePrincipal';
import { authorize } from '../middleware/authorize';
import type { SyncService } from '../services/sync';

export function createSyncRouter(service: SyncService): Router {
  const router = Router();

  router.get(
    '/devices',
    authorize('devices:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      res.json(successEnvelope(await service.listDevices(principal.organizationId)));
    }),
  );

  router.post(
    '/devices',
    authorize('devices:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const input = registerDeviceRequestSchema.parse(req.body);
      const device = await service.registerDevice(principal.organizationId, input);
      res.status(201).json(successEnvelope(device));
    }),
  );

  router.post(
    '/devices/:id/revoke',
    authorize('devices:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      res.json(successEnvelope(await service.revokeDevice(principal.organizationId, id)));
    }),
  );

  router.get(
    '/sync/conflicts',
    authorize('sync:review'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = listQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.listConflicts(principal.organizationId, query.limit)));
    }),
  );

  router.post(
    '/sync/push',
    authorize('sync:push'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const input = syncPushRequestSchema.parse(req.body);
      res.json(
        successEnvelope(await service.push(principal.organizationId, principal.userId, input)),
      );
    }),
  );

  router.get(
    '/sync/pull',
    authorize('sync:pull'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = syncPullQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.pull(principal.organizationId, query)));
    }),
  );

  return router;
}

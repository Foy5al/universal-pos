import { Router } from 'express';

import {
  createStaffRequestSchema,
  resourceIdSchema,
  successEnvelope,
  updateStaffPermissionsRequestSchema,
} from '@pos/contracts';

import { forbidden } from '../core/errors';
import { hasStoreScope } from '../core/principal';
import { asyncHandler } from '../http/asyncHandler';
import { requirePrincipal } from '../http/requirePrincipal';
import { authorize } from '../middleware/authorize';
import type { StaffService } from '../services/staff';

export function createStaffRouter(service: StaffService): Router {
  const router = Router();

  router.get(
    '/staff',
    authorize('staff:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      res.json(successEnvelope({ staff: await service.list(principal.organizationId) }));
    }),
  );

  router.post(
    '/staff',
    authorize('staff:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const input = createStaffRequestSchema.parse(req.body);
      if (input.storeId && !hasStoreScope(principal, input.storeId)) {
        throw forbidden('Store outside assigned scope');
      }
      const member = await service.create(principal.organizationId, input);
      res.status(201).json(successEnvelope(member));
    }),
  );

  router.patch(
    '/staff/:userId/permissions',
    authorize('staff:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const userId = resourceIdSchema.parse(req.params.userId);
      const input = updateStaffPermissionsRequestSchema.parse(req.body);
      const member = await service.setPermissions(
        principal.organizationId,
        principal.userId,
        userId,
        input.permissions,
      );
      res.json(successEnvelope(member));
    }),
  );

  return router;
}

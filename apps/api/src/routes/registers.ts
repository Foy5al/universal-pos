import { Router } from 'express';

import {
  addCashMovementRequestSchema,
  closeRegisterShiftRequestSchema,
  createRegisterRequestSchema,
  listQuerySchema,
  openRegisterShiftRequestSchema,
  registerShiftListQuerySchema,
  resourceIdSchema,
  successEnvelope,
} from '@pos/contracts';

import { forbidden } from '../core/errors';
import { hasStoreScope } from '../core/principal';
import { asyncHandler } from '../http/asyncHandler';
import { requirePrincipal } from '../http/requirePrincipal';
import { authorize } from '../middleware/authorize';
import type { RegisterService } from '../services/registers';

export function createRegistersRouter(service: RegisterService): Router {
  const router = Router();

  router.get(
    '/registers',
    authorize('registers:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = listQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.list(principal.organizationId, query)));
    }),
  );

  router.post(
    '/registers',
    authorize('registers:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const input = createRegisterRequestSchema.parse(req.body);
      if (!hasStoreScope(principal, input.storeId)) {
        throw forbidden('Store outside assigned scope');
      }
      const register = await service.create(principal.organizationId, input);
      res.status(201).json(successEnvelope(register));
    }),
  );

  router.get(
    '/register-shifts/current',
    authorize('registers:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const registerId = resourceIdSchema.parse(req.query.registerId);
      res.json(successEnvelope(await service.current(principal.organizationId, registerId)));
    }),
  );

  router.get(
    '/register-shifts',
    authorize('registers:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = registerShiftListQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.listShifts(principal.organizationId, query)));
    }),
  );

  router.get(
    '/register-shifts/:id',
    authorize('registers:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      res.json(successEnvelope(await service.getShift(principal.organizationId, id)));
    }),
  );

  router.post(
    '/register-shifts',
    authorize('registers:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const input = openRegisterShiftRequestSchema.parse(req.body);
      const shift = await service.openShift(principal.organizationId, principal.userId, input);
      res.status(201).json(successEnvelope(shift));
    }),
  );

  router.post(
    '/register-shifts/:id/cash-movements',
    authorize('registers:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      const input = addCashMovementRequestSchema.parse(req.body);
      const movement = await service.addCashMovement(
        principal.organizationId,
        principal.userId,
        id,
        input,
      );
      res.status(201).json(successEnvelope(movement));
    }),
  );

  router.post(
    '/register-shifts/:id/close',
    authorize('registers:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      const input = closeRegisterShiftRequestSchema.parse(req.body);
      const shift = await service.closeShift(principal.organizationId, principal.userId, id, input);
      res.json(successEnvelope(shift));
    }),
  );

  return router;
}

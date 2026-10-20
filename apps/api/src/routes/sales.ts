import { Router } from 'express';

import {
  createRefundRequestSchema,
  createSaleRequestSchema,
  resourceIdSchema,
  saleListQuerySchema,
  successEnvelope,
} from '@pos/contracts';

import { asyncHandler } from '../http/asyncHandler';
import { requirePrincipal } from '../http/requirePrincipal';
import { authorize } from '../middleware/authorize';
import type { SalesService } from '../services/sales';

export function createSalesRouter(service: SalesService): Router {
  const router = Router();

  router.get(
    '/sales',
    authorize('sales:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = saleListQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.list(principal.organizationId, query)));
    }),
  );

  router.post(
    '/sales',
    authorize('sales:create'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const input = createSaleRequestSchema.parse(req.body);
      const sale = await service.create(principal.organizationId, principal.userId, input);
      res.status(201).json(successEnvelope(sale));
    }),
  );

  router.get(
    '/sales/:id',
    authorize('sales:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      res.json(successEnvelope(await service.get(principal.organizationId, id)));
    }),
  );

  router.post(
    '/sales/:id/refunds',
    authorize('refunds:approve'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      const input = createRefundRequestSchema.parse(req.body);
      const refund = await service.refund(principal.organizationId, principal.userId, id, input);
      res.status(201).json(successEnvelope(refund));
    }),
  );

  return router;
}

import { Router } from 'express';

import { reportRangeQuerySchema, resourceIdSchema, successEnvelope } from '@pos/contracts';

import { asyncHandler } from '../http/asyncHandler';
import { requirePrincipal } from '../http/requirePrincipal';
import { authorize } from '../middleware/authorize';
import type { ReportsService } from '../services/reports';

export function createReportsRouter(service: ReportsService): Router {
  const router = Router();

  router.get(
    '/reports/sales-summary',
    authorize('reports:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = reportRangeQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.salesSummary(principal, query)));
    }),
  );

  router.get(
    '/reports/store-activity',
    authorize('reports:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = reportRangeQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.storeActivity(principal, query)));
    }),
  );

  router.get(
    '/reports/shifts/:id',
    authorize('reports:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      res.json(successEnvelope(await service.shiftReport(principal, id)));
    }),
  );

  return router;
}

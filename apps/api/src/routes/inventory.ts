import { Router } from 'express';

import {
  createStockAdjustmentRequestSchema,
  createStockLocationRequestSchema,
  createStockLossRequestSchema,
  inventoryListQuerySchema,
  stockLossListQuerySchema,
  successEnvelope,
  updateStockLocationRequestSchema,
} from '@pos/contracts';

import { asyncHandler } from '../http/asyncHandler';
import { requirePrincipal } from '../http/requirePrincipal';
import { authorize } from '../middleware/authorize';
import type { InventoryService } from '../services/inventory';
import { createCrudRouter, type CrudPermissions } from './crud';

export function createInventoryRouter(service: InventoryService): Router {
  const router = Router();
  const locationPermissions: CrudPermissions = {
    read: 'inventory:read',
    manage: 'inventory:manage',
  };

  router.use(
    createCrudRouter('/inventory/locations', service.locations, locationPermissions, {
      create: createStockLocationRequestSchema,
      update: updateStockLocationRequestSchema,
    }),
  );

  router.get(
    '/inventory/balances',
    authorize('inventory:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = inventoryListQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.listBalances(principal.organizationId, query)));
    }),
  );

  router.get(
    '/inventory/movements',
    authorize('inventory:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = inventoryListQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.listMovements(principal.organizationId, query)));
    }),
  );

  router.get(
    '/inventory/losses',
    authorize('inventory:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = stockLossListQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.listLosses(principal.organizationId, query)));
    }),
  );

  router.post(
    '/inventory/losses',
    authorize('inventory:adjust'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const input = createStockLossRequestSchema.parse(req.body);
      const result = await service.recordLoss(principal.organizationId, input);
      res.status(201).json(successEnvelope(result));
    }),
  );

  router.post(
    '/inventory/adjustments',
    authorize('inventory:adjust'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const input = createStockAdjustmentRequestSchema.parse(req.body);
      const result = await service.adjust(principal.organizationId, input);
      res.status(201).json(successEnvelope(result));
    }),
  );

  return router;
}

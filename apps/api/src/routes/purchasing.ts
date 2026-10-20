import { Router } from 'express';

import {
  addSupplierProductRequestSchema,
  createPurchaseOrderRequestSchema,
  createRestockRequestSchema,
  createSupplierRequestSchema,
  purchaseOrderListQuerySchema,
  receivePurchaseOrderRequestSchema,
  resourceIdSchema,
  restockRequestListQuerySchema,
  successEnvelope,
  supplierProductListQuerySchema,
  updatePurchaseOrderStatusRequestSchema,
  updateRestockRequestSchema,
  updateSupplierRequestSchema,
} from '@pos/contracts';

import { asyncHandler } from '../http/asyncHandler';
import { requirePrincipal } from '../http/requirePrincipal';
import { authorize, authorizeAny } from '../middleware/authorize';
import type { PurchasingService } from '../services/purchasing';
import { createCrudRouter, type CrudPermissions } from './crud';

export function createPurchasingRouter(service: PurchasingService): Router {
  const router = Router();
  const permissions: CrudPermissions = { read: 'purchases:read', manage: 'purchases:manage' };

  router.use(
    createCrudRouter('/purchases/suppliers', service.suppliers, permissions, {
      create: createSupplierRequestSchema,
      update: updateSupplierRequestSchema,
    }),
  );

  router.get(
    '/purchases/suppliers/:supplierId/products',
    authorize('purchases:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const supplierId = resourceIdSchema.parse(req.params.supplierId);
      const query = supplierProductListQuerySchema.parse(req.query);
      res.json(
        successEnvelope(await service.supplierProducts.list(principal, supplierId, query)),
      );
    }),
  );

  router.post(
    '/purchases/suppliers/:supplierId/products',
    authorize('purchases:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const supplierId = resourceIdSchema.parse(req.params.supplierId);
      const input = addSupplierProductRequestSchema.parse(req.body);
      const product = await service.supplierProducts.add(principal, supplierId, input);
      res.status(201).json(successEnvelope(product));
    }),
  );

  router.delete(
    '/purchases/suppliers/:supplierId/products/:productId',
    authorize('purchases:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const supplierId = resourceIdSchema.parse(req.params.supplierId);
      const productId = resourceIdSchema.parse(req.params.productId);
      await service.supplierProducts.remove(principal, supplierId, productId);
      res.status(204).end();
    }),
  );

  router.get(
    '/restock-requests',
    authorizeAny('restock:request', 'purchases:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = restockRequestListQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.restock.list(principal, query)));
    }),
  );

  router.post(
    '/restock-requests',
    authorize('restock:request'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const input = createRestockRequestSchema.parse(req.body);
      res.status(201).json(successEnvelope(await service.restock.create(principal, input)));
    }),
  );

  router.patch(
    '/restock-requests/:id',
    authorize('purchases:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      updateRestockRequestSchema.parse(req.body);
      res.json(successEnvelope(await service.restock.dismiss(principal, id)));
    }),
  );

  router.get(
    '/purchases/orders',
    authorize('purchases:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = purchaseOrderListQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.listOrders(principal, query)));
    }),
  );

  router.post(
    '/purchases/orders',
    authorize('purchases:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const input = createPurchaseOrderRequestSchema.parse(req.body);
      const order = await service.createOrder(principal, input);
      res.status(201).json(successEnvelope(order));
    }),
  );

  router.get(
    '/purchases/orders/:id',
    authorize('purchases:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      res.json(successEnvelope(await service.getOrder(principal, id)));
    }),
  );

  router.patch(
    '/purchases/orders/:id/status',
    authorize('purchases:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      const input = updatePurchaseOrderStatusRequestSchema.parse(req.body);
      res.json(successEnvelope(await service.updateOrderStatus(principal, id, input)));
    }),
  );

  router.post(
    '/purchases/orders/:id/receipts',
    authorize('purchases:manage'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      const input = receivePurchaseOrderRequestSchema.parse(req.body);
      const result = await service.receiveOrder(principal, id, input);
      res.status(201).json(successEnvelope(result));
    }),
  );

  return router;
}

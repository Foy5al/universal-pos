import { Router } from 'express';

import { successEnvelope } from '@pos/contracts';
import type { StoreRepository } from '@pos/db';

import { forbidden, notFound, badRequest } from '../core/errors';
import { hasStoreScope } from '../core/principal';
import { requirePrincipal } from '../http/requirePrincipal';
import { authorize } from '../middleware/authorize';

export function createStoresRouter(repo: StoreRepository): Router {
  const router = Router();

  router.get('/stores', authorize('stores:read'), async (req, res, next) => {
    try {
      const principal = requirePrincipal(req);
      const stores = await repo.listByOrganization(principal.organizationId);
      res.json(successEnvelope({ stores }));
    } catch (error) {
      next(error);
    }
  });

  router.get('/stores/:storeId', authorize('stores:read'), async (req, res, next) => {
    try {
      const principal = requirePrincipal(req);
      const storeId = req.params.storeId;
      if (typeof storeId !== 'string') {
        next(badRequest('Invalid store id'));
        return;
      }
      const store = await repo.findInOrganization(principal.organizationId, storeId);
      if (!store) {
        next(notFound('Store not found'));
        return;
      }
      if (!hasStoreScope(principal, store.id)) {
        next(forbidden('Store outside assigned scope'));
        return;
      }
      res.json(successEnvelope({ store }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

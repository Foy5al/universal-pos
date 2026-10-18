import { Router } from 'express';

import {
  createBrandRequestSchema,
  createCategoryRequestSchema,
  createProductRequestSchema,
  createUnitRequestSchema,
  updateBrandRequestSchema,
  updateCategoryRequestSchema,
  updateProductRequestSchema,
  updateUnitRequestSchema,
} from '@pos/contracts';

import type { CatalogService } from '../services/catalog';
import { createCrudRouter, type CrudPermissions } from './crud';

export function createCatalogRouter(service: CatalogService): Router {
  const router = Router();
  const permissions: CrudPermissions = { read: 'catalog:read', manage: 'catalog:manage' };

  router.use(
    createCrudRouter('/catalog/categories', service.categories, permissions, {
      create: createCategoryRequestSchema,
      update: updateCategoryRequestSchema,
    }),
  );
  router.use(
    createCrudRouter('/catalog/brands', service.brands, permissions, {
      create: createBrandRequestSchema,
      update: updateBrandRequestSchema,
    }),
  );
  router.use(
    createCrudRouter('/catalog/units', service.units, permissions, {
      create: createUnitRequestSchema,
      update: updateUnitRequestSchema,
    }),
  );
  router.use(
    createCrudRouter('/catalog/products', service.products, permissions, {
      create: createProductRequestSchema,
      update: updateProductRequestSchema,
    }),
  );

  return router;
}

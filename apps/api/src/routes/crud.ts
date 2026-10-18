import { Router } from 'express';
import { z } from 'zod';

import {
  listQuerySchema,
  resourceIdSchema,
  successEnvelope,
  type Page,
  type Permission,
} from '@pos/contracts';

import { asyncHandler } from '../http/asyncHandler';
import { requirePrincipal } from '../http/requirePrincipal';
import { authorize } from '../middleware/authorize';
import type { CrudService } from '../services/catalog';

export interface CrudSchemas<TCreate, TUpdate> {
  create: z.ZodType<TCreate>;
  update: z.ZodType<TUpdate>;
}

export interface CrudPermissions {
  read: Permission;
  manage: Permission;
}

/**
 * Registers list/create/get/patch for one tenant-scoped resource. The service
 * owns validation; the principal's organization scopes every call.
 */
export function createCrudRouter<TRecord, TCreate extends object, TUpdate extends object>(
  basePath: string,
  service: CrudService<TRecord, TCreate, TUpdate>,
  permissions: CrudPermissions,
  schemas: CrudSchemas<TCreate, TUpdate>,
): Router {
  const router = Router();

  router.get(
    basePath,
    authorize(permissions.read),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = listQuerySchema.parse(req.query);
      const result: Page<TRecord> = await service.list(principal.organizationId, query);
      res.json(successEnvelope(result));
    }),
  );

  router.post(
    basePath,
    authorize(permissions.manage),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const input = schemas.create.parse(req.body);
      const record = await service.create(principal.organizationId, input);
      res.status(201).json(successEnvelope(record));
    }),
  );

  router.get(
    `${basePath}/:id`,
    authorize(permissions.read),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      const record = await service.get(principal.organizationId, id);
      res.json(successEnvelope(record));
    }),
  );

  router.patch(
    `${basePath}/:id`,
    authorize(permissions.manage),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      const input = schemas.update.parse(req.body);
      const record = await service.update(principal.organizationId, id, input);
      res.json(successEnvelope(record));
    }),
  );

  return router;
}

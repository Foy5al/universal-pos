import { page, type ListQuery, type Page } from '@pos/contracts';
import { UniqueConstraintError, type CatalogListOptions } from '@pos/db';

import { conflict, notFound } from '../../core/errors';

/**
 * Structural repository shape shared by the tenant-scoped catalog resources.
 * Organization scoping is enforced by the repository on every method.
 */
export interface CrudRepository<TRecord, TCreate, TUpdate> {
  list(
    organizationId: string,
    options: CatalogListOptions,
  ): Promise<{ items: TRecord[]; total: number }>;
  findById(organizationId: string, id: string): Promise<TRecord | null>;
  create(input: TCreate & { organizationId: string }): Promise<TRecord>;
  update(organizationId: string, id: string, input: TUpdate): Promise<TRecord | null>;
}

export interface CrudService<TRecord, TCreate, TUpdate> {
  list(organizationId: string, query: ListQuery): Promise<Page<TRecord>>;
  get(organizationId: string, id: string): Promise<TRecord>;
  create(organizationId: string, input: TCreate): Promise<TRecord>;
  update(organizationId: string, id: string, input: TUpdate): Promise<TRecord>;
}

function mapWriteError(error: unknown, resource: string): unknown {
  return error instanceof UniqueConstraintError ? conflict(`${resource} already exists`) : error;
}

export function createCrudService<TRecord, TCreate, TUpdate>(
  repo: CrudRepository<TRecord, TCreate, TUpdate>,
  resource: string,
): CrudService<TRecord, TCreate, TUpdate> {
  return {
    async list(organizationId, query) {
      const result = await repo.list(organizationId, {
        limit: query.limit,
        offset: query.offset,
      });
      return page(result.items, result.total, query);
    },
    async get(organizationId, id) {
      const record = await repo.findById(organizationId, id);
      if (!record) {
        throw notFound(`${resource} not found`);
      }
      return record;
    },
    async create(organizationId, input) {
      try {
        return await repo.create({ ...input, organizationId });
      } catch (error) {
        throw mapWriteError(error, resource);
      }
    },
    async update(organizationId, id, input) {
      try {
        const record = await repo.update(organizationId, id, input);
        if (!record) {
          throw notFound(`${resource} not found`);
        }
        return record;
      } catch (error) {
        throw mapWriteError(error, resource);
      }
    },
  };
}

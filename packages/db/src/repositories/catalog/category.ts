import { randomUUID } from 'node:crypto';

import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../../client';
import { categories } from '../../schema/catalog';
import type { CatalogListOptions, CatalogListResult } from './types';

export interface CategoryRecord {
  id: string;
  organizationId: string;
  parentId: string | null;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateCategoryInput {
  organizationId: string;
  name: string;
  parentId?: string | undefined;
  isActive?: boolean | undefined;
}

export interface UpdateCategoryInput {
  name?: string | undefined;
  parentId?: string | undefined;
  isActive?: boolean | undefined;
}

export interface CategoryRepository {
  list(
    organizationId: string,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<CategoryRecord>>;
  findById(organizationId: string, id: string): Promise<CategoryRecord | null>;
  create(input: CreateCategoryInput): Promise<CategoryRecord>;
  update(
    organizationId: string,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryRecord | null>;
}

function toCategoryRecord(row: typeof categories.$inferSelect): CategoryRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    parentId: row.parentId,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export class InMemoryCategoryRepository implements CategoryRepository {
  private readonly records: CategoryRecord[];

  constructor(records: readonly CategoryRecord[] = []) {
    this.records = [...records];
  }

  async list(
    organizationId: string,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<CategoryRecord>> {
    const scoped = this.records.filter((record) => record.organizationId === organizationId);
    return {
      items: scoped.slice(options.offset, options.offset + options.limit),
      total: scoped.length,
    };
  }

  async findById(organizationId: string, id: string): Promise<CategoryRecord | null> {
    return (
      this.records.find((record) => record.organizationId === organizationId && record.id === id) ??
      null
    );
  }

  async create(input: CreateCategoryInput): Promise<CategoryRecord> {
    const record: CategoryRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      parentId: input.parentId ?? null,
      name: input.name,
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
    };
    this.records.push(record);
    return record;
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryRecord | null> {
    const record = await this.findById(organizationId, id);
    if (!record) {
      return null;
    }
    if (input.name !== undefined) record.name = input.name;
    if (input.parentId !== undefined) record.parentId = input.parentId;
    if (input.isActive !== undefined) record.isActive = input.isActive;
    return record;
  }
}

export function createDrizzleCategoryRepository(db: Database): CategoryRepository {
  return {
    async list(organizationId, options) {
      const where = eq(categories.organizationId, organizationId);
      const rows = await db
        .select()
        .from(categories)
        .where(where)
        .orderBy(asc(categories.name), asc(categories.id))
        .limit(options.limit)
        .offset(options.offset);
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(categories)
        .where(where);
      return {
        items: rows.map(toCategoryRecord),
        total: countRows[0]?.count ?? 0,
      };
    },
    async findById(organizationId, id) {
      const rows = await db
        .select()
        .from(categories)
        .where(and(eq(categories.organizationId, organizationId), eq(categories.id, id)))
        .limit(1);
      const row = rows[0];
      return row ? toCategoryRecord(row) : null;
    },
    async create(input) {
      const rows = await db
        .insert(categories)
        .values({
          organizationId: input.organizationId,
          name: input.name,
          parentId: input.parentId ?? null,
          isActive: input.isActive ?? true,
        })
        .returning();
      const row = rows[0];
      if (!row) {
        throw new Error('Failed to insert category');
      }
      return toCategoryRecord(row);
    },
    async update(organizationId, id, input) {
      const patch: Partial<typeof categories.$inferInsert> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.parentId !== undefined) patch.parentId = input.parentId;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      const rows = await db
        .update(categories)
        .set(patch)
        .where(and(eq(categories.organizationId, organizationId), eq(categories.id, id)))
        .returning();
      const row = rows[0];
      return row ? toCategoryRecord(row) : null;
    },
  };
}

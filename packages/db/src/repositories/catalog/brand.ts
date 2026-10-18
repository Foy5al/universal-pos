import { randomUUID } from 'node:crypto';

import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../../client';
import { brands } from '../../schema/catalog';
import { isUniqueViolation, UniqueConstraintError } from './errors';
import type { CatalogListOptions, CatalogListResult } from './types';

export interface BrandRecord {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateBrandInput {
  organizationId: string;
  name: string;
  isActive?: boolean | undefined;
}

export interface UpdateBrandInput {
  name?: string | undefined;
  isActive?: boolean | undefined;
}

export interface BrandRepository {
  list(
    organizationId: string,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<BrandRecord>>;
  findById(organizationId: string, id: string): Promise<BrandRecord | null>;
  create(input: CreateBrandInput): Promise<BrandRecord>;
  update(organizationId: string, id: string, input: UpdateBrandInput): Promise<BrandRecord | null>;
}

function toBrandRecord(row: typeof brands.$inferSelect): BrandRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export class InMemoryBrandRepository implements BrandRepository {
  private readonly records: BrandRecord[];

  constructor(records: readonly BrandRecord[] = []) {
    this.records = [...records];
  }

  async list(
    organizationId: string,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<BrandRecord>> {
    const scoped = this.records.filter((record) => record.organizationId === organizationId);
    return {
      items: scoped.slice(options.offset, options.offset + options.limit),
      total: scoped.length,
    };
  }

  async findById(organizationId: string, id: string): Promise<BrandRecord | null> {
    return (
      this.records.find((record) => record.organizationId === organizationId && record.id === id) ??
      null
    );
  }

  async create(input: CreateBrandInput): Promise<BrandRecord> {
    if (
      this.records.some(
        (record) => record.organizationId === input.organizationId && record.name === input.name,
      )
    ) {
      throw new UniqueConstraintError('brand');
    }
    const record: BrandRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
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
    input: UpdateBrandInput,
  ): Promise<BrandRecord | null> {
    const record = await this.findById(organizationId, id);
    if (!record) {
      return null;
    }
    if (input.name !== undefined) {
      const clash = this.records.some(
        (other) =>
          other.organizationId === organizationId && other.id !== id && other.name === input.name,
      );
      if (clash) {
        throw new UniqueConstraintError('brand');
      }
      record.name = input.name;
    }
    if (input.isActive !== undefined) record.isActive = input.isActive;
    return record;
  }
}

export function createDrizzleBrandRepository(db: Database): BrandRepository {
  return {
    async list(organizationId, options) {
      const where = eq(brands.organizationId, organizationId);
      const rows = await db
        .select()
        .from(brands)
        .where(where)
        .orderBy(asc(brands.name), asc(brands.id))
        .limit(options.limit)
        .offset(options.offset);
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(brands)
        .where(where);
      return { items: rows.map(toBrandRecord), total: countRows[0]?.count ?? 0 };
    },
    async findById(organizationId, id) {
      const rows = await db
        .select()
        .from(brands)
        .where(and(eq(brands.organizationId, organizationId), eq(brands.id, id)))
        .limit(1);
      const row = rows[0];
      return row ? toBrandRecord(row) : null;
    },
    async create(input) {
      try {
        const rows = await db
          .insert(brands)
          .values({
            organizationId: input.organizationId,
            name: input.name,
            isActive: input.isActive ?? true,
          })
          .returning();
        const row = rows[0];
        if (!row) {
          throw new Error('Failed to insert brand');
        }
        return toBrandRecord(row);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new UniqueConstraintError('brand');
        }
        throw error;
      }
    },
    async update(organizationId, id, input) {
      const patch: Partial<typeof brands.$inferInsert> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      try {
        const rows = await db
          .update(brands)
          .set(patch)
          .where(and(eq(brands.organizationId, organizationId), eq(brands.id, id)))
          .returning();
        const row = rows[0];
        return row ? toBrandRecord(row) : null;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new UniqueConstraintError('brand');
        }
        throw error;
      }
    },
  };
}

import { randomUUID } from 'node:crypto';

import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../../client';
import { stockLocations } from '../../schema/inventory';
import { isUniqueViolation, UniqueConstraintError } from '../catalog/errors';
import type { CatalogListOptions, CatalogListResult } from '../catalog/types';

export interface StockLocationRecord {
  id: string;
  organizationId: string;
  storeId: string | null;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateStockLocationInput {
  organizationId: string;
  name: string;
  storeId?: string | undefined;
  isActive?: boolean | undefined;
}

export interface UpdateStockLocationInput {
  name?: string | undefined;
  isActive?: boolean | undefined;
}

export interface StockLocationRepository {
  list(
    organizationId: string,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<StockLocationRecord>>;
  findById(organizationId: string, id: string): Promise<StockLocationRecord | null>;
  create(input: CreateStockLocationInput): Promise<StockLocationRecord>;
  update(
    organizationId: string,
    id: string,
    input: UpdateStockLocationInput,
  ): Promise<StockLocationRecord | null>;
}

function toStockLocationRecord(row: typeof stockLocations.$inferSelect): StockLocationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export class InMemoryStockLocationRepository implements StockLocationRepository {
  private readonly records: StockLocationRecord[];

  constructor(records: readonly StockLocationRecord[] = []) {
    this.records = [...records];
  }

  async list(
    organizationId: string,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<StockLocationRecord>> {
    const scoped = this.records
      .filter((record) => record.organizationId === organizationId)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return {
      items: scoped.slice(options.offset, options.offset + options.limit),
      total: scoped.length,
    };
  }

  async findById(organizationId: string, id: string): Promise<StockLocationRecord | null> {
    return (
      this.records.find((record) => record.organizationId === organizationId && record.id === id) ??
      null
    );
  }

  async create(input: CreateStockLocationInput): Promise<StockLocationRecord> {
    if (
      this.records.some(
        (record) => record.organizationId === input.organizationId && record.name === input.name,
      )
    ) {
      throw new UniqueConstraintError('stock location');
    }
    const record: StockLocationRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      storeId: input.storeId ?? null,
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
    input: UpdateStockLocationInput,
  ): Promise<StockLocationRecord | null> {
    const record = await this.findById(organizationId, id);
    if (!record) {
      return null;
    }
    if (input.name !== undefined) record.name = input.name;
    if (input.isActive !== undefined) record.isActive = input.isActive;
    return record;
  }
}

export function createDrizzleStockLocationRepository(db: Database): StockLocationRepository {
  return {
    async list(organizationId, options) {
      const where = eq(stockLocations.organizationId, organizationId);
      const rows = await db
        .select()
        .from(stockLocations)
        .where(where)
        .orderBy(asc(stockLocations.name), asc(stockLocations.id))
        .limit(options.limit)
        .offset(options.offset);
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(stockLocations)
        .where(where);
      return { items: rows.map(toStockLocationRecord), total: countRows[0]?.count ?? 0 };
    },
    async findById(organizationId, id) {
      const rows = await db
        .select()
        .from(stockLocations)
        .where(and(eq(stockLocations.organizationId, organizationId), eq(stockLocations.id, id)))
        .limit(1);
      const row = rows[0];
      return row ? toStockLocationRecord(row) : null;
    },
    async create(input) {
      try {
        const rows = await db
          .insert(stockLocations)
          .values({
            organizationId: input.organizationId,
            name: input.name,
            storeId: input.storeId ?? null,
            isActive: input.isActive ?? true,
          })
          .returning();
        const row = rows[0];
        if (!row) {
          throw new Error('Failed to insert stock location');
        }
        return toStockLocationRecord(row);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new UniqueConstraintError('stock location');
        }
        throw error;
      }
    },
    async update(organizationId, id, input) {
      const patch: Partial<typeof stockLocations.$inferInsert> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      const rows = await db
        .update(stockLocations)
        .set(patch)
        .where(and(eq(stockLocations.organizationId, organizationId), eq(stockLocations.id, id)))
        .returning();
      const row = rows[0];
      return row ? toStockLocationRecord(row) : null;
    },
  };
}

import { randomUUID } from 'node:crypto';

import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../../client';
import { products } from '../../schema/catalog';
import { isUniqueViolation, UniqueConstraintError } from './errors';
import type { CatalogListOptions, CatalogListResult } from './types';

export interface ProductRecord {
  id: string;
  organizationId: string;
  sku: string;
  name: string;
  categoryId: string | null;
  brandId: string | null;
  unitId: string | null;
  barcode: string | null;
  priceMinor: number;
  costMinor: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateProductInput {
  organizationId: string;
  sku: string;
  name: string;
  priceMinor: number;
  costMinor?: number | undefined;
  barcode?: string | undefined;
  categoryId?: string | undefined;
  brandId?: string | undefined;
  unitId?: string | undefined;
  isActive?: boolean | undefined;
}

export interface UpdateProductInput {
  sku?: string | undefined;
  name?: string | undefined;
  priceMinor?: number | undefined;
  costMinor?: number | undefined;
  barcode?: string | undefined;
  categoryId?: string | undefined;
  brandId?: string | undefined;
  unitId?: string | undefined;
  isActive?: boolean | undefined;
}

export interface ProductRepository {
  list(
    organizationId: string,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<ProductRecord>>;
  findById(organizationId: string, id: string): Promise<ProductRecord | null>;
  create(input: CreateProductInput): Promise<ProductRecord>;
  update(
    organizationId: string,
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductRecord | null>;
}

function toProductRecord(row: typeof products.$inferSelect): ProductRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sku: row.sku,
    name: row.name,
    categoryId: row.categoryId,
    brandId: row.brandId,
    unitId: row.unitId,
    barcode: row.barcode,
    priceMinor: row.priceMinor,
    costMinor: row.costMinor,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export class InMemoryProductRepository implements ProductRepository {
  private readonly records: ProductRecord[];

  constructor(records: readonly ProductRecord[] = []) {
    this.records = [...records];
  }

  async list(
    organizationId: string,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<ProductRecord>> {
    const scoped = this.records
      .filter((record) => record.organizationId === organizationId)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return {
      items: scoped.slice(options.offset, options.offset + options.limit),
      total: scoped.length,
    };
  }

  async findById(organizationId: string, id: string): Promise<ProductRecord | null> {
    return (
      this.records.find((record) => record.organizationId === organizationId && record.id === id) ??
      null
    );
  }

  async create(input: CreateProductInput): Promise<ProductRecord> {
    if (
      this.records.some(
        (record) => record.organizationId === input.organizationId && record.sku === input.sku,
      )
    ) {
      throw new UniqueConstraintError('product');
    }
    const record: ProductRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      sku: input.sku,
      name: input.name,
      categoryId: input.categoryId ?? null,
      brandId: input.brandId ?? null,
      unitId: input.unitId ?? null,
      barcode: input.barcode ?? null,
      priceMinor: input.priceMinor,
      costMinor: input.costMinor ?? null,
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
    };
    this.records.push(record);
    return record;
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductRecord | null> {
    const record = await this.findById(organizationId, id);
    if (!record) {
      return null;
    }
    if (input.sku !== undefined) {
      const clash = this.records.some(
        (other) =>
          other.organizationId === organizationId && other.id !== id && other.sku === input.sku,
      );
      if (clash) {
        throw new UniqueConstraintError('product');
      }
      record.sku = input.sku;
    }
    if (input.name !== undefined) record.name = input.name;
    if (input.priceMinor !== undefined) record.priceMinor = input.priceMinor;
    if (input.costMinor !== undefined) record.costMinor = input.costMinor;
    if (input.barcode !== undefined) record.barcode = input.barcode;
    if (input.categoryId !== undefined) record.categoryId = input.categoryId;
    if (input.brandId !== undefined) record.brandId = input.brandId;
    if (input.unitId !== undefined) record.unitId = input.unitId;
    if (input.isActive !== undefined) record.isActive = input.isActive;
    return record;
  }
}

export function createDrizzleProductRepository(db: Database): ProductRepository {
  return {
    async list(organizationId, options) {
      const where = eq(products.organizationId, organizationId);
      const rows = await db
        .select()
        .from(products)
        .where(where)
        .orderBy(asc(products.name), asc(products.id))
        .limit(options.limit)
        .offset(options.offset);
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(where);
      return { items: rows.map(toProductRecord), total: countRows[0]?.count ?? 0 };
    },
    async findById(organizationId, id) {
      const rows = await db
        .select()
        .from(products)
        .where(and(eq(products.organizationId, organizationId), eq(products.id, id)))
        .limit(1);
      const row = rows[0];
      return row ? toProductRecord(row) : null;
    },
    async create(input) {
      try {
        const rows = await db
          .insert(products)
          .values({
            organizationId: input.organizationId,
            sku: input.sku,
            name: input.name,
            categoryId: input.categoryId ?? null,
            brandId: input.brandId ?? null,
            unitId: input.unitId ?? null,
            barcode: input.barcode ?? null,
            priceMinor: input.priceMinor,
            costMinor: input.costMinor ?? null,
            isActive: input.isActive ?? true,
          })
          .returning();
        const row = rows[0];
        if (!row) {
          throw new Error('Failed to insert product');
        }
        return toProductRecord(row);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new UniqueConstraintError('product');
        }
        throw error;
      }
    },
    async update(organizationId, id, input) {
      const patch: Partial<typeof products.$inferInsert> = {};
      if (input.sku !== undefined) patch.sku = input.sku;
      if (input.name !== undefined) patch.name = input.name;
      if (input.priceMinor !== undefined) patch.priceMinor = input.priceMinor;
      if (input.costMinor !== undefined) patch.costMinor = input.costMinor;
      if (input.barcode !== undefined) patch.barcode = input.barcode;
      if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
      if (input.brandId !== undefined) patch.brandId = input.brandId;
      if (input.unitId !== undefined) patch.unitId = input.unitId;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      try {
        const rows = await db
          .update(products)
          .set(patch)
          .where(and(eq(products.organizationId, organizationId), eq(products.id, id)))
          .returning();
        const row = rows[0];
        return row ? toProductRecord(row) : null;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new UniqueConstraintError('product');
        }
        throw error;
      }
    },
  };
}

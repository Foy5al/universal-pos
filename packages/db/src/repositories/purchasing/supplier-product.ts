import { randomUUID } from 'node:crypto';

import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../../client';
import { supplierProducts } from '../../schema/purchasing';
import type { CatalogListOptions, CatalogListResult } from '../catalog/types';

export interface SupplierProductRecord {
  id: string;
  organizationId: string;
  supplierId: string;
  productId: string;
  supplierSku: string | null;
  unitCostMinor: number;
  isActive: boolean;
  createdAt: string;
}

export interface UpsertSupplierProductInput {
  organizationId: string;
  supplierId: string;
  productId: string;
  supplierSku?: string | undefined;
  unitCostMinor: number;
  isActive?: boolean | undefined;
}

export interface SupplierProductRepository {
  list(
    organizationId: string,
    supplierId: string,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<SupplierProductRecord>>;
  find(
    organizationId: string,
    supplierId: string,
    productId: string,
  ): Promise<SupplierProductRecord | null>;
  upsert(input: UpsertSupplierProductInput): Promise<SupplierProductRecord>;
  remove(organizationId: string, supplierId: string, productId: string): Promise<boolean>;
}

function toRecord(row: typeof supplierProducts.$inferSelect): SupplierProductRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    supplierId: row.supplierId,
    productId: row.productId,
    supplierSku: row.supplierSku,
    unitCostMinor: row.unitCostMinor,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export class InMemorySupplierProductRepository implements SupplierProductRepository {
  private readonly records: SupplierProductRecord[];

  constructor(records: readonly SupplierProductRecord[] = []) {
    this.records = records.map((record) => ({ ...record }));
  }

  async list(
    organizationId: string,
    supplierId: string,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<SupplierProductRecord>> {
    const scoped = this.records
      .filter(
        (record) =>
          record.organizationId === organizationId && record.supplierId === supplierId,
      )
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      );
    return {
      items: scoped.slice(options.offset, options.offset + options.limit),
      total: scoped.length,
    };
  }

  async find(
    organizationId: string,
    supplierId: string,
    productId: string,
  ): Promise<SupplierProductRecord | null> {
    return (
      this.records.find(
        (record) =>
          record.organizationId === organizationId &&
          record.supplierId === supplierId &&
          record.productId === productId,
      ) ?? null
    );
  }

  async upsert(input: UpsertSupplierProductInput): Promise<SupplierProductRecord> {
    const existing = await this.find(input.organizationId, input.supplierId, input.productId);
    if (existing) {
      existing.supplierSku = input.supplierSku ?? null;
      existing.unitCostMinor = input.unitCostMinor;
      existing.isActive = input.isActive ?? true;
      return existing;
    }
    const record: SupplierProductRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      supplierId: input.supplierId,
      productId: input.productId,
      supplierSku: input.supplierSku ?? null,
      unitCostMinor: input.unitCostMinor,
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
    };
    this.records.push(record);
    return record;
  }

  async remove(
    organizationId: string,
    supplierId: string,
    productId: string,
  ): Promise<boolean> {
    const index = this.records.findIndex(
      (record) =>
        record.organizationId === organizationId &&
        record.supplierId === supplierId &&
        record.productId === productId,
    );
    if (index < 0) return false;
    this.records.splice(index, 1);
    return true;
  }
}

export function createDrizzleSupplierProductRepository(db: Database): SupplierProductRepository {
  return {
    async list(organizationId, supplierId, options) {
      const where = and(
        eq(supplierProducts.organizationId, organizationId),
        eq(supplierProducts.supplierId, supplierId),
      );
      const rows = await db
        .select()
        .from(supplierProducts)
        .where(where)
        .orderBy(asc(supplierProducts.createdAt), asc(supplierProducts.id))
        .limit(options.limit)
        .offset(options.offset);
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(supplierProducts)
        .where(where);
      return { items: rows.map(toRecord), total: countRows[0]?.count ?? 0 };
    },
    async find(organizationId, supplierId, productId) {
      const rows = await db
        .select()
        .from(supplierProducts)
        .where(
          and(
            eq(supplierProducts.organizationId, organizationId),
            eq(supplierProducts.supplierId, supplierId),
            eq(supplierProducts.productId, productId),
          ),
        )
        .limit(1);
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async upsert(input) {
      const rows = await db
        .insert(supplierProducts)
        .values({
          organizationId: input.organizationId,
          supplierId: input.supplierId,
          productId: input.productId,
          supplierSku: input.supplierSku ?? null,
          unitCostMinor: input.unitCostMinor,
          isActive: input.isActive ?? true,
        })
        .onConflictDoUpdate({
          target: [supplierProducts.supplierId, supplierProducts.productId],
          set: {
            supplierSku: input.supplierSku ?? null,
            unitCostMinor: input.unitCostMinor,
            isActive: input.isActive ?? true,
          },
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error('Failed to save supplier product');
      return toRecord(row);
    },
    async remove(organizationId, supplierId, productId) {
      const rows = await db
        .delete(supplierProducts)
        .where(
          and(
            eq(supplierProducts.organizationId, organizationId),
            eq(supplierProducts.supplierId, supplierId),
            eq(supplierProducts.productId, productId),
          ),
        )
        .returning({ id: supplierProducts.id });
      return rows.length > 0;
    },
  };
}

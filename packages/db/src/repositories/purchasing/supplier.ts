import { randomUUID } from 'node:crypto';

import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../../client';
import { suppliers } from '../../schema/purchasing';
import { isUniqueViolation, UniqueConstraintError } from '../catalog/errors';
import type { CatalogListOptions, CatalogListResult } from '../catalog/types';

export interface SupplierRecord {
  id: string;
  organizationId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateSupplierInput {
  organizationId: string;
  name: string;
  contactName?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  address?: string | undefined;
  isActive?: boolean | undefined;
}

export interface UpdateSupplierInput {
  name?: string | undefined;
  contactName?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  address?: string | undefined;
  isActive?: boolean | undefined;
}

export interface SupplierRepository {
  list(
    organizationId: string,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<SupplierRecord>>;
  findById(organizationId: string, id: string): Promise<SupplierRecord | null>;
  create(input: CreateSupplierInput): Promise<SupplierRecord>;
  update(
    organizationId: string,
    id: string,
    input: UpdateSupplierInput,
  ): Promise<SupplierRecord | null>;
}

function toSupplierRecord(row: typeof suppliers.$inferSelect): SupplierRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    address: row.address,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export class InMemorySupplierRepository implements SupplierRepository {
  private readonly records: SupplierRecord[];

  constructor(records: readonly SupplierRecord[] = []) {
    this.records = [...records];
  }

  async list(
    organizationId: string,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<SupplierRecord>> {
    const scoped = this.records
      .filter((record) => record.organizationId === organizationId)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return {
      items: scoped.slice(options.offset, options.offset + options.limit),
      total: scoped.length,
    };
  }

  async findById(organizationId: string, id: string): Promise<SupplierRecord | null> {
    return (
      this.records.find((record) => record.organizationId === organizationId && record.id === id) ??
      null
    );
  }

  async create(input: CreateSupplierInput): Promise<SupplierRecord> {
    if (
      this.records.some(
        (record) => record.organizationId === input.organizationId && record.name === input.name,
      )
    ) {
      throw new UniqueConstraintError('supplier');
    }
    const record: SupplierRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      name: input.name,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
    };
    this.records.push(record);
    return record;
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateSupplierInput,
  ): Promise<SupplierRecord | null> {
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
        throw new UniqueConstraintError('supplier');
      }
      record.name = input.name;
    }
    if (input.contactName !== undefined) record.contactName = input.contactName;
    if (input.phone !== undefined) record.phone = input.phone;
    if (input.email !== undefined) record.email = input.email;
    if (input.address !== undefined) record.address = input.address;
    if (input.isActive !== undefined) record.isActive = input.isActive;
    return record;
  }
}

export function createDrizzleSupplierRepository(db: Database): SupplierRepository {
  return {
    async list(organizationId, options) {
      const where = eq(suppliers.organizationId, organizationId);
      const rows = await db
        .select()
        .from(suppliers)
        .where(where)
        .orderBy(asc(suppliers.name), asc(suppliers.id))
        .limit(options.limit)
        .offset(options.offset);
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(suppliers)
        .where(where);
      return { items: rows.map(toSupplierRecord), total: countRows[0]?.count ?? 0 };
    },
    async findById(organizationId, id) {
      const rows = await db
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.organizationId, organizationId), eq(suppliers.id, id)))
        .limit(1);
      const row = rows[0];
      return row ? toSupplierRecord(row) : null;
    },
    async create(input) {
      try {
        const rows = await db
          .insert(suppliers)
          .values({
            organizationId: input.organizationId,
            name: input.name,
            contactName: input.contactName ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            address: input.address ?? null,
            isActive: input.isActive ?? true,
          })
          .returning();
        const row = rows[0];
        if (!row) {
          throw new Error('Failed to insert supplier');
        }
        return toSupplierRecord(row);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new UniqueConstraintError('supplier');
        }
        throw error;
      }
    },
    async update(organizationId, id, input) {
      const patch: Partial<typeof suppliers.$inferInsert> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.contactName !== undefined) patch.contactName = input.contactName;
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.email !== undefined) patch.email = input.email;
      if (input.address !== undefined) patch.address = input.address;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      try {
        const rows = await db
          .update(suppliers)
          .set(patch)
          .where(and(eq(suppliers.organizationId, organizationId), eq(suppliers.id, id)))
          .returning();
        const row = rows[0];
        return row ? toSupplierRecord(row) : null;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new UniqueConstraintError('supplier');
        }
        throw error;
      }
    },
  };
}

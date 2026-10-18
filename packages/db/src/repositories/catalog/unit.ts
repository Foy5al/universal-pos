import { randomUUID } from 'node:crypto';

import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../../client';
import { units } from '../../schema/catalog';
import { isUniqueViolation, UniqueConstraintError } from './errors';
import type { CatalogListOptions, CatalogListResult } from './types';

export interface UnitRecord {
  id: string;
  organizationId: string;
  name: string;
  abbreviation: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateUnitInput {
  organizationId: string;
  name: string;
  abbreviation: string;
  isActive?: boolean | undefined;
}

export interface UpdateUnitInput {
  name?: string | undefined;
  abbreviation?: string | undefined;
  isActive?: boolean | undefined;
}

export interface UnitRepository {
  list(organizationId: string, options: CatalogListOptions): Promise<CatalogListResult<UnitRecord>>;
  findById(organizationId: string, id: string): Promise<UnitRecord | null>;
  create(input: CreateUnitInput): Promise<UnitRecord>;
  update(organizationId: string, id: string, input: UpdateUnitInput): Promise<UnitRecord | null>;
}

function toUnitRecord(row: typeof units.$inferSelect): UnitRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    abbreviation: row.abbreviation,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export class InMemoryUnitRepository implements UnitRepository {
  private readonly records: UnitRecord[];

  constructor(records: readonly UnitRecord[] = []) {
    this.records = [...records];
  }

  async list(
    organizationId: string,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<UnitRecord>> {
    const scoped = this.records.filter((record) => record.organizationId === organizationId);
    return {
      items: scoped.slice(options.offset, options.offset + options.limit),
      total: scoped.length,
    };
  }

  async findById(organizationId: string, id: string): Promise<UnitRecord | null> {
    return (
      this.records.find((record) => record.organizationId === organizationId && record.id === id) ??
      null
    );
  }

  async create(input: CreateUnitInput): Promise<UnitRecord> {
    if (
      this.records.some(
        (record) =>
          record.organizationId === input.organizationId &&
          record.abbreviation === input.abbreviation,
      )
    ) {
      throw new UniqueConstraintError('unit');
    }
    const record: UnitRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      name: input.name,
      abbreviation: input.abbreviation,
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
    };
    this.records.push(record);
    return record;
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateUnitInput,
  ): Promise<UnitRecord | null> {
    const record = await this.findById(organizationId, id);
    if (!record) {
      return null;
    }
    if (input.name !== undefined) record.name = input.name;
    if (input.abbreviation !== undefined) {
      const clash = this.records.some(
        (other) =>
          other.organizationId === organizationId &&
          other.id !== id &&
          other.abbreviation === input.abbreviation,
      );
      if (clash) {
        throw new UniqueConstraintError('unit');
      }
      record.abbreviation = input.abbreviation;
    }
    if (input.isActive !== undefined) record.isActive = input.isActive;
    return record;
  }
}

export function createDrizzleUnitRepository(db: Database): UnitRepository {
  return {
    async list(organizationId, options) {
      const where = eq(units.organizationId, organizationId);
      const rows = await db
        .select()
        .from(units)
        .where(where)
        .orderBy(asc(units.name), asc(units.id))
        .limit(options.limit)
        .offset(options.offset);
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(units)
        .where(where);
      return { items: rows.map(toUnitRecord), total: countRows[0]?.count ?? 0 };
    },
    async findById(organizationId, id) {
      const rows = await db
        .select()
        .from(units)
        .where(and(eq(units.organizationId, organizationId), eq(units.id, id)))
        .limit(1);
      const row = rows[0];
      return row ? toUnitRecord(row) : null;
    },
    async create(input) {
      try {
        const rows = await db
          .insert(units)
          .values({
            organizationId: input.organizationId,
            name: input.name,
            abbreviation: input.abbreviation,
            isActive: input.isActive ?? true,
          })
          .returning();
        const row = rows[0];
        if (!row) {
          throw new Error('Failed to insert unit');
        }
        return toUnitRecord(row);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new UniqueConstraintError('unit');
        }
        throw error;
      }
    },
    async update(organizationId, id, input) {
      const patch: Partial<typeof units.$inferInsert> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.abbreviation !== undefined) patch.abbreviation = input.abbreviation;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      try {
        const rows = await db
          .update(units)
          .set(patch)
          .where(and(eq(units.organizationId, organizationId), eq(units.id, id)))
          .returning();
        const row = rows[0];
        return row ? toUnitRecord(row) : null;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new UniqueConstraintError('unit');
        }
        throw error;
      }
    },
  };
}

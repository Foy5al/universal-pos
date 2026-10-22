import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import type { Database } from '../../client';
import { registers, stores } from '../../schema/tenancy';

export interface RegisterRecord {
  id: string;
  organizationId: string;
  storeId: string;
  name: string;
  code: string;
}

export interface CreateRegisterInput {
  organizationId: string;
  storeId: string;
  name: string;
  code: string;
}

export interface RegisterRepository {
  listByOrganization(organizationId: string): Promise<RegisterRecord[]>;
  findInOrganization(organizationId: string, id: string): Promise<RegisterRecord | null>;
  findByCode(organizationId: string, storeId: string, code: string): Promise<RegisterRecord | null>;
  create(input: CreateRegisterInput): Promise<RegisterRecord>;
}

function toRegisterRecord(row: typeof registers.$inferSelect): RegisterRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    name: row.name,
    code: row.code,
  };
}

export class InMemoryRegisterRepository implements RegisterRepository {
  private readonly records: RegisterRecord[];

  constructor(records: readonly RegisterRecord[] = []) {
    this.records = [...records];
  }

  async listByOrganization(organizationId: string): Promise<RegisterRecord[]> {
    return this.records.filter((record) => record.organizationId === organizationId);
  }

  async findInOrganization(organizationId: string, id: string): Promise<RegisterRecord | null> {
    return (
      this.records.find((record) => record.organizationId === organizationId && record.id === id) ??
      null
    );
  }

  async findByCode(
    organizationId: string,
    storeId: string,
    code: string,
  ): Promise<RegisterRecord | null> {
    return (
      this.records.find(
        (record) =>
          record.organizationId === organizationId &&
          record.storeId === storeId &&
          record.code === code,
      ) ?? null
    );
  }

  async create(input: CreateRegisterInput): Promise<RegisterRecord> {
    const record: RegisterRecord = { id: randomUUID(), ...input };
    this.records.push(record);
    return record;
  }
}

export function createDrizzleRegisterRepository(db: Database): RegisterRepository {
  return {
    async listByOrganization(organizationId) {
      const rows = await db
        .select()
        .from(registers)
        .where(eq(registers.organizationId, organizationId))
        .orderBy(registers.name);
      return rows.map(toRegisterRecord);
    },
    async findInOrganization(organizationId, id) {
      const rows = await db
        .select()
        .from(registers)
        .where(and(eq(registers.organizationId, organizationId), eq(registers.id, id)))
        .limit(1);
      const row = rows[0];
      return row ? toRegisterRecord(row) : null;
    },
    async findByCode(organizationId, storeId, code) {
      const rows = await db
        .select()
        .from(registers)
        .where(
          and(
            eq(registers.organizationId, organizationId),
            eq(registers.storeId, storeId),
            eq(registers.code, code),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row ? toRegisterRecord(row) : null;
    },
    async create(input) {
      const storeRows = await db
        .select({ id: stores.id })
        .from(stores)
        .where(and(eq(stores.id, input.storeId), eq(stores.organizationId, input.organizationId)))
        .limit(1);
      if (!storeRows[0]) {
        throw new Error('Store not found in organization');
      }
      const rows = await db.insert(registers).values(input).returning();
      const row = rows[0];
      if (!row) {
        throw new Error('Failed to create register');
      }
      return toRegisterRecord(row);
    },
  };
}

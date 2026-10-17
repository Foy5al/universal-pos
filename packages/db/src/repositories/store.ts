import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import type { Database } from '../client';
import { stores } from '../schema/tenancy';

export interface StoreRecord {
  id: string;
  organizationId: string;
  name: string;
  timezone: string;
  isActive: boolean;
}

export interface StoreRepository {
  listByOrganization(organizationId: string): Promise<StoreRecord[]>;
  findInOrganization(organizationId: string, storeId: string): Promise<StoreRecord | null>;
  create(input: {
    organizationId: string;
    name: string;
    timezone: string;
  }): Promise<StoreRecord>;
}

function toStoreRecord(row: typeof stores.$inferSelect): StoreRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    timezone: row.timezone,
    isActive: row.isActive,
  };
}

export class InMemoryStoreRepository implements StoreRepository {
  private readonly records: StoreRecord[];

  constructor(records: readonly StoreRecord[] = []) {
    this.records = [...records];
  }

  async listByOrganization(organizationId: string): Promise<StoreRecord[]> {
    return this.records.filter((store) => store.organizationId === organizationId);
  }

  async findInOrganization(organizationId: string, storeId: string): Promise<StoreRecord | null> {
    return (
      this.records.find(
        (store) => store.organizationId === organizationId && store.id === storeId,
      ) ?? null
    );
  }

  async create(input: {
    organizationId: string;
    name: string;
    timezone: string;
  }): Promise<StoreRecord> {
    const record: StoreRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      name: input.name,
      timezone: input.timezone,
      isActive: true,
    };
    this.records.push(record);
    return record;
  }
}

export function createDrizzleStoreRepository(db: Database): StoreRepository {
  return {
    async listByOrganization(organizationId) {
      const rows = await db
        .select()
        .from(stores)
        .where(eq(stores.organizationId, organizationId));
      return rows.map(toStoreRecord);
    },
    async findInOrganization(organizationId, storeId) {
      const rows = await db
        .select()
        .from(stores)
        .where(and(eq(stores.organizationId, organizationId), eq(stores.id, storeId)))
        .limit(1);
      const row = rows[0];
      return row ? toStoreRecord(row) : null;
    },
    async create(input) {
      const rows = await db
        .insert(stores)
        .values({
          organizationId: input.organizationId,
          name: input.name,
          timezone: input.timezone,
        })
        .returning();
      const row = rows[0];
      if (!row) {
        throw new Error('Failed to insert store');
      }
      return toStoreRecord(row);
    },
  };
}

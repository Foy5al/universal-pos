import { and, eq } from 'drizzle-orm';

import type { Database } from '../../client';
import { registers } from '../../schema/tenancy';

export interface RegisterRecord {
  id: string;
  organizationId: string;
  storeId: string;
  name: string;
  code: string;
}

export interface RegisterRepository {
  listByOrganization(organizationId: string): Promise<RegisterRecord[]>;
  findInOrganization(organizationId: string, id: string): Promise<RegisterRecord | null>;
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
      this.records.find(
        (record) => record.organizationId === organizationId && record.id === id,
      ) ?? null
    );
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
  };
}

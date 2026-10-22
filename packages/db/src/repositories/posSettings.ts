import { eq } from 'drizzle-orm';

import type { Database } from '../client';
import { posSettings } from '../schema/pos';

export interface PosSettingsRecord {
  organizationId: string;
  requireRemovalPassword: boolean;
  removalPasswordSalt: string | null;
  removalPasswordHash: string | null;
  removalPasswordIterations: number;
  updatedAt: string;
}

export interface PosSettingsWrite {
  requireRemovalPassword: boolean;
  removalPasswordSalt: string | null;
  removalPasswordHash: string | null;
  removalPasswordIterations: number;
}

export interface PosSettingsRepository {
  get(organizationId: string): Promise<PosSettingsRecord | null>;
  upsert(organizationId: string, input: PosSettingsWrite): Promise<PosSettingsRecord>;
}

export class InMemoryPosSettingsRepository implements PosSettingsRepository {
  private readonly records = new Map<string, PosSettingsRecord>();

  async get(organizationId: string): Promise<PosSettingsRecord | null> {
    const record = this.records.get(organizationId);
    return record ? { ...record } : null;
  }

  async upsert(organizationId: string, input: PosSettingsWrite): Promise<PosSettingsRecord> {
    const record: PosSettingsRecord = {
      organizationId,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(organizationId, record);
    return { ...record };
  }
}

export function createDrizzlePosSettingsRepository(db: Database): PosSettingsRepository {
  return {
    async get(organizationId) {
      const rows = await db
        .select()
        .from(posSettings)
        .where(eq(posSettings.organizationId, organizationId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        organizationId: row.organizationId,
        requireRemovalPassword: row.requireRemovalPassword,
        removalPasswordSalt: row.removalPasswordSalt,
        removalPasswordHash: row.removalPasswordHash,
        removalPasswordIterations: row.removalPasswordIterations,
        updatedAt: row.updatedAt.toISOString(),
      };
    },
    async upsert(organizationId, input) {
      const rows = await db
        .insert(posSettings)
        .values({ organizationId, ...input })
        .onConflictDoUpdate({
          target: posSettings.organizationId,
          set: { ...input, updatedAt: new Date() },
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error('Failed to save POS settings');
      return {
        organizationId: row.organizationId,
        requireRemovalPassword: row.requireRemovalPassword,
        removalPasswordSalt: row.removalPasswordSalt,
        removalPasswordHash: row.removalPasswordHash,
        removalPasswordIterations: row.removalPasswordIterations,
        updatedAt: row.updatedAt.toISOString(),
      };
    },
  };
}

import { eq } from 'drizzle-orm';

import type { Database } from '../../client';
import { lowStockSettings } from '../../schema/inventory';
import { formatScaledQuantity, parseScaledQuantity } from './quantity';

export interface LowStockSettingsRecord {
  organizationId: string;
  globalThreshold: string | null;
  updatedAt: string;
}

/**
 * Organization-wide fallback threshold. Products without their own threshold
 * inherit this value; the product row always takes precedence.
 */
export interface LowStockSettingsRepository {
  get(organizationId: string): Promise<LowStockSettingsRecord | null>;
  upsert(organizationId: string, globalThreshold: string | null): Promise<LowStockSettingsRecord>;
}

function toQuantityString(value: string | null): string | null {
  return value === null ? null : formatScaledQuantity(parseScaledQuantity(value));
}

export class InMemoryLowStockSettingsRepository implements LowStockSettingsRepository {
  private readonly records = new Map<string, LowStockSettingsRecord>();

  async get(organizationId: string): Promise<LowStockSettingsRecord | null> {
    const record = this.records.get(organizationId);
    return record ? { ...record } : null;
  }

  async upsert(
    organizationId: string,
    globalThreshold: string | null,
  ): Promise<LowStockSettingsRecord> {
    const record: LowStockSettingsRecord = {
      organizationId,
      globalThreshold,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(organizationId, record);
    return { ...record };
  }
}

export function createDrizzleLowStockSettingsRepository(db: Database): LowStockSettingsRepository {
  return {
    async get(organizationId) {
      const rows = await db
        .select()
        .from(lowStockSettings)
        .where(eq(lowStockSettings.organizationId, organizationId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        organizationId: row.organizationId,
        globalThreshold: toQuantityString(row.globalThreshold),
        updatedAt: row.updatedAt.toISOString(),
      };
    },
    async upsert(organizationId, globalThreshold) {
      const rows = await db
        .insert(lowStockSettings)
        .values({ organizationId, globalThreshold })
        .onConflictDoUpdate({
          target: lowStockSettings.organizationId,
          set: { globalThreshold, updatedAt: new Date() },
        })
        .returning();
      const row = rows[0];
      if (!row) {
        throw new Error('Failed to save low stock settings');
      }
      return {
        organizationId: row.organizationId,
        globalThreshold: toQuantityString(row.globalThreshold),
        updatedAt: row.updatedAt.toISOString(),
      };
    },
  };
}

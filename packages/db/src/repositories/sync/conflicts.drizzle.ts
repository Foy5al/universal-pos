import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '../../client';
import { syncConflicts } from '../../schema/sync';
import { isUniqueViolation } from '../catalog/errors';
import { toConflictRecord } from './mappers';
import type {
  RecordSyncConflictInput,
  ResolveSyncConflictInput,
  SyncConflictRecord,
} from './types';

export interface ConflictQueries {
  recordConflict(input: RecordSyncConflictInput): Promise<SyncConflictRecord>;
  findConflict(organizationId: string, id: string): Promise<SyncConflictRecord | null>;
  listConflicts(organizationId: string, limit: number): Promise<SyncConflictRecord[]>;
  resolveConflict(
    organizationId: string,
    id: string,
    input: ResolveSyncConflictInput,
  ): Promise<SyncConflictRecord | null>;
}

export function createConflictQueries(db: Database): ConflictQueries {
  async function findByOperation(
    organizationId: string,
    operationId: string,
  ): Promise<SyncConflictRecord | null> {
    const rows = await db
      .select()
      .from(syncConflicts)
      .where(
        and(
          eq(syncConflicts.organizationId, organizationId),
          eq(syncConflicts.operationId, operationId),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toConflictRecord(row) : null;
  }

  return {
    async recordConflict(input) {
      const existing = await findByOperation(input.organizationId, input.operationId);
      if (existing) return existing;

      try {
        const rows = await db
          .insert(syncConflicts)
          .values({
            organizationId: input.organizationId,
            deviceId: input.deviceId,
            operationId: input.operationId,
            entityId: input.entityId,
            cashierId: input.cashierId ?? null,
            reason: input.reason,
            details: input.details ?? null,
            payload: input.payload ?? null,
          })
          .returning();
        const row = rows[0];
        if (!row) throw new Error('Failed to record sync conflict');
        return toConflictRecord(row);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const conflicted = await findByOperation(input.organizationId, input.operationId);
        if (!conflicted) throw error;
        return conflicted;
      }
    },

    async findConflict(organizationId, id) {
      const rows = await db
        .select()
        .from(syncConflicts)
        .where(and(eq(syncConflicts.organizationId, organizationId), eq(syncConflicts.id, id)))
        .limit(1);
      const row = rows[0];
      return row ? toConflictRecord(row) : null;
    },

    async listConflicts(organizationId, limit) {
      const rows = await db
        .select()
        .from(syncConflicts)
        .where(eq(syncConflicts.organizationId, organizationId))
        .orderBy(desc(syncConflicts.createdAt), desc(syncConflicts.id))
        .limit(limit);
      return rows.map(toConflictRecord);
    },

    async resolveConflict(organizationId, id, input) {
      const rows = await db
        .update(syncConflicts)
        .set({
          status: 'resolved',
          resolution: input.resolution,
          resolutionNote: input.resolutionNote,
          resolvedAt: new Date(input.resolvedAt),
          resolvedBy: input.resolvedBy,
        })
        .where(
          and(
            eq(syncConflicts.organizationId, organizationId),
            eq(syncConflicts.id, id),
            eq(syncConflicts.status, 'open'),
          ),
        )
        .returning();
      const row = rows[0];
      return row ? toConflictRecord(row) : null;
    },
  };
}

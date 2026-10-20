import { and, asc, desc, eq, gt } from 'drizzle-orm';

import type { Database } from '../../client';
import { syncConflicts, syncOperations } from '../../schema/sync';
import { devices } from '../../schema/tenancy';
import { isUniqueViolation } from '../catalog/errors';
import {
  DeviceOwnershipConflictError,
  type DeviceRecord,
  type RecordSyncConflictInput,
  type RecordSyncOperationInput,
  type RegisterDeviceInput,
  type SyncConflictRecord,
  type SyncOperationRecord,
  type SyncRepository,
} from './types';

type DeviceRow = typeof devices.$inferSelect;
type OperationRow = typeof syncOperations.$inferSelect;
type ConflictRow = typeof syncConflicts.$inferSelect;

function toDeviceRecord(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    registerId: row.registerId,
    name: row.name,
    platform: row.platform,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

function toOperationRecord(row: OperationRow): SyncOperationRecord {
  return {
    sequence: row.sequence,
    organizationId: row.organizationId,
    deviceId: row.deviceId,
    operationId: row.operationId,
    entityId: row.entityId,
    entityType: row.entityType,
    eventType: row.eventType,
    clientSequence: row.clientSequence,
    status: row.status,
    saleId: row.saleId,
    conflictReason: row.conflictReason,
    message: row.message,
    occurredAt: row.occurredAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
  };
}

function toConflictRecord(row: ConflictRow): SyncConflictRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    deviceId: row.deviceId,
    operationId: row.operationId,
    entityId: row.entityId,
    reason: row.reason,
    details: row.details,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createDrizzleSyncRepository(db: Database): SyncRepository {
  async function findDeviceRow(organizationId: string, id: string): Promise<DeviceRow | null> {
    const rows = await db
      .select()
      .from(devices)
      .where(and(eq(devices.organizationId, organizationId), eq(devices.id, id)))
      .limit(1);
    return rows[0] ?? null;
  }

  async function findOperationRow(
    organizationId: string,
    operationId: string,
  ): Promise<OperationRow | null> {
    const rows = await db
      .select()
      .from(syncOperations)
      .where(
        and(
          eq(syncOperations.organizationId, organizationId),
          eq(syncOperations.operationId, operationId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async function registerDevice(input: RegisterDeviceInput): Promise<DeviceRecord> {
    const existing = await findDeviceRow(input.organizationId, input.id);
    if (existing) {
      if (existing.revokedAt) {
        return toDeviceRecord(existing);
      }
      const rows = await db
        .update(devices)
        .set({
          name: input.name,
          platform: input.platform,
          storeId: input.storeId,
          registerId: input.registerId ?? existing.registerId,
          lastSeenAt: new Date(),
        })
        .where(and(eq(devices.organizationId, input.organizationId), eq(devices.id, input.id)))
        .returning();
      const row = rows[0];
      if (!row) throw new Error('Failed to update device');
      return toDeviceRecord(row);
    }

    try {
      const rows = await db
        .insert(devices)
        .values({
          id: input.id,
          organizationId: input.organizationId,
          storeId: input.storeId,
          registerId: input.registerId ?? null,
          name: input.name,
          platform: input.platform,
          lastSeenAt: new Date(),
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error('Failed to register device');
      return toDeviceRecord(row);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const conflicted = await findDeviceRow(input.organizationId, input.id);
      if (conflicted) return toDeviceRecord(conflicted);
      throw new DeviceOwnershipConflictError();
    }
  }

  return {
    registerDevice,

    async findDevice(organizationId, id) {
      const row = await findDeviceRow(organizationId, id);
      return row ? toDeviceRecord(row) : null;
    },

    async listDevices(organizationId) {
      const rows = await db
        .select()
        .from(devices)
        .where(eq(devices.organizationId, organizationId))
        .orderBy(asc(devices.name), asc(devices.id));
      return rows.map(toDeviceRecord);
    },

    async revokeDevice(organizationId, id) {
      const rows = await db
        .update(devices)
        .set({ revokedAt: new Date(), isActive: false })
        .where(and(eq(devices.organizationId, organizationId), eq(devices.id, id)))
        .returning();
      const row = rows[0];
      return row ? toDeviceRecord(row) : null;
    },

    async findOperation(organizationId, operationId) {
      const row = await findOperationRow(organizationId, operationId);
      return row ? toOperationRecord(row) : null;
    },

    async recordOperation(input: RecordSyncOperationInput) {
      const existing = await findOperationRow(input.organizationId, input.operationId);
      if (existing) return toOperationRecord(existing);

      try {
        const rows = await db
          .insert(syncOperations)
          .values({
            organizationId: input.organizationId,
            deviceId: input.deviceId,
            operationId: input.operationId,
            entityId: input.entityId,
            entityType: input.entityType,
            eventType: input.eventType,
            clientSequence: input.clientSequence,
            status: input.status,
            saleId: input.saleId ?? null,
            conflictReason: input.conflictReason ?? null,
            message: input.message ?? null,
            occurredAt: new Date(input.occurredAt),
          })
          .returning();
        const row = rows[0];
        if (!row) throw new Error('Failed to record sync operation');
        return toOperationRecord(row);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const conflicted = await findOperationRow(input.organizationId, input.operationId);
        if (!conflicted) throw error;
        return toOperationRecord(conflicted);
      }
    },

    async listOperationsAfter(organizationId, deviceId, afterSequence, limit) {
      const rows = await db
        .select()
        .from(syncOperations)
        .where(
          and(
            eq(syncOperations.organizationId, organizationId),
            eq(syncOperations.deviceId, deviceId),
            gt(syncOperations.sequence, afterSequence),
          ),
        )
        .orderBy(asc(syncOperations.sequence))
        .limit(limit);
      return rows.map(toOperationRecord);
    },

    async recordConflict(input: RecordSyncConflictInput) {
      const existing = await db
        .select()
        .from(syncConflicts)
        .where(
          and(
            eq(syncConflicts.organizationId, input.organizationId),
            eq(syncConflicts.operationId, input.operationId),
          ),
        )
        .limit(1);
      const found = existing[0];
      if (found) return toConflictRecord(found);

      try {
        const rows = await db
          .insert(syncConflicts)
          .values({
            organizationId: input.organizationId,
            deviceId: input.deviceId,
            operationId: input.operationId,
            entityId: input.entityId,
            reason: input.reason,
            details: input.details ?? null,
          })
          .returning();
        const row = rows[0];
        if (!row) throw new Error('Failed to record sync conflict');
        return toConflictRecord(row);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const rows = await db
          .select()
          .from(syncConflicts)
          .where(
            and(
              eq(syncConflicts.organizationId, input.organizationId),
              eq(syncConflicts.operationId, input.operationId),
            ),
          )
          .limit(1);
        const row = rows[0];
        if (!row) throw error;
        return toConflictRecord(row);
      }
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
  };
}

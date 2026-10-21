import { and, asc, eq, gt } from 'drizzle-orm';

import type { Database } from '../../client';
import { syncOperations } from '../../schema/sync';
import { devices } from '../../schema/tenancy';
import { isUniqueViolation } from '../catalog/errors';
import { createConflictQueries } from './conflicts.drizzle';
import { toDeviceRecord, toOperationRecord, type DeviceRow, type OperationRow } from './mappers';
import {
  DeviceOwnershipConflictError,
  type DeviceRecord,
  type RecordSyncOperationInput,
  type RegisterDeviceInput,
  type ResolveSyncOperationInput,
  type SyncRepository,
} from './types';

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
    ...createConflictQueries(db),
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

    async resolveOperation(organizationId, operationId, input: ResolveSyncOperationInput) {
      const rows = await db
        .update(syncOperations)
        .set({
          status: input.status,
          saleId: input.saleId ?? null,
          conflictReason: input.conflictReason ?? null,
          message: input.message ?? null,
        })
        .where(
          and(
            eq(syncOperations.organizationId, organizationId),
            eq(syncOperations.operationId, operationId),
          ),
        )
        .returning();
      const row = rows[0];
      return row ? toOperationRecord(row) : null;
    },
  };
}

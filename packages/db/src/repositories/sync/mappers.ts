import type { syncConflicts, syncOperations } from '../../schema/sync';
import type { devices } from '../../schema/tenancy';
import type { DeviceRecord, SyncConflictRecord, SyncOperationRecord } from './types';

export type DeviceRow = typeof devices.$inferSelect;
export type OperationRow = typeof syncOperations.$inferSelect;
export type ConflictRow = typeof syncConflicts.$inferSelect;

export function toDeviceRecord(row: DeviceRow): DeviceRecord {
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

export function toOperationRecord(row: OperationRow): SyncOperationRecord {
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

export function toConflictRecord(row: ConflictRow): SyncConflictRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    deviceId: row.deviceId,
    operationId: row.operationId,
    entityId: row.entityId,
    cashierId: row.cashierId,
    reason: row.reason,
    details: row.details,
    payload: row.payload,
    status: row.status === 'resolved' ? 'resolved' : 'open',
    resolution:
      row.resolution === 'retried' || row.resolution === 'dismissed' ? row.resolution : null,
    resolutionNote: row.resolutionNote,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolvedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

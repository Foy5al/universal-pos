import type {
  ResolveSyncConflictRequest,
  ResolveSyncConflictResponse,
  SyncConflict,
} from '@pos/contracts';
import type { SaleRecord, SyncConflictRecord, SyncRepository } from '@pos/db';

import { conflict, notFound, validationError } from '../../core/errors';
import type { SalesService } from '../sales';

export function toSyncConflict(record: SyncConflictRecord): SyncConflict {
  return {
    id: record.id,
    organizationId: record.organizationId,
    operationId: record.operationId,
    deviceId: record.deviceId,
    cashierId: record.cashierId,
    entityId: record.entityId,
    reason: record.reason,
    details: record.details,
    payload: record.payload,
    status: record.status,
    resolution: record.resolution,
    resolutionNote: record.resolutionNote,
    resolvedAt: record.resolvedAt,
    resolvedBy: record.resolvedBy,
    createdAt: record.createdAt,
  };
}

async function retrySale(
  sales: SalesService,
  organizationId: string,
  userId: string,
  record: SyncConflictRecord,
): Promise<SaleRecord> {
  if (!record.payload) {
    throw validationError(
      'This conflict has no stored sale payload and can only be dismissed manually',
    );
  }
  const existing = await sales.findByOperationId(organizationId, record.operationId);
  if (existing) return existing;

  const { locationId, registerShiftId, customerName, lines, payments } = record.payload;
  return sales.createFromDevice(organizationId, record.cashierId ?? userId, {
    operationId: record.operationId,
    locationId,
    registerShiftId,
    customerName,
    lines,
    payments,
  });
}

/**
 * Resolves one review case explicitly. Cash was already taken at the till, so a
 * dismissal requires a note and never deletes the original operation record.
 */
export async function resolveConflict(
  repo: SyncRepository,
  sales: SalesService,
  organizationId: string,
  userId: string,
  conflictId: string,
  input: ResolveSyncConflictRequest,
): Promise<ResolveSyncConflictResponse> {
  const record = await repo.findConflict(organizationId, conflictId);
  if (!record) throw notFound('Sync conflict not found');
  if (record.status === 'resolved') throw conflict('Sync conflict has already been resolved');

  let sale: SaleRecord | null = null;
  if (input.action === 'retry') {
    sale = await retrySale(sales, organizationId, userId, record);
  }

  const resolution = input.action === 'retry' ? 'retried' : 'dismissed';
  const resolved = await repo.resolveConflict(organizationId, conflictId, {
    resolution,
    resolutionNote: input.note ?? null,
    resolvedBy: userId,
    resolvedAt: new Date().toISOString(),
  });
  if (!resolved) throw conflict('Sync conflict was resolved by another reviewer');

  await repo.resolveOperation(organizationId, record.operationId, {
    status: sale ? 'accepted' : 'rejected',
    saleId: sale?.id ?? null,
    conflictReason: sale ? null : 'rejected_operation',
    message: sale ? null : (input.note ?? 'Conflict dismissed during review'),
  });

  return { conflict: toSyncConflict(resolved), sale };
}

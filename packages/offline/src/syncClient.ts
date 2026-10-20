import type {
  RegisterDeviceRequest,
  SyncEvent,
  SyncPullResponse,
  SyncPushResponse,
} from '@pos/contracts';

import { readSyncCursor, writeSyncCursor, type PosOfflineDatabase } from './db';
import {
  OUTBOX_BATCH_SIZE,
  applyPushResult,
  dueOutboxEvents,
  markOutboxRetryable,
  markOutboxSending,
  recoverInterruptedSends,
} from './outbox';
import type { OutboxEvent } from './types';

export interface SyncTransport {
  push(request: { device: RegisterDeviceRequest; events: SyncEvent[] }): Promise<SyncPushResponse>;
  pull(query: { deviceId: string; cursor: number; limit?: number }): Promise<SyncPullResponse>;
}

export interface SyncRunResult {
  attempted: number;
  accepted: number;
  needsReview: number;
  rejected: number;
  retryable: number;
  cursor: number;
  syncedAt: string;
}

export function toSyncEvent(event: OutboxEvent): SyncEvent {
  return {
    operationId: event.operationId,
    entityId: event.entityId,
    entityType: 'sale',
    eventType: 'sale.completed',
    deviceId: event.deviceId,
    clientSequence: event.clientSequence,
    occurredAt: event.occurredAt,
    payloadVersion: 1,
    payload: event.payload,
  };
}

/**
 * Pushes due outbox events in causal order, then pulls acknowledged operations
 * so provisional receipts get their canonical invoice number (ADR-0004).
 */
export async function runSync(
  db: PosOfflineDatabase,
  device: RegisterDeviceRequest,
  transport: SyncTransport,
  options: { now?: Date; online?: boolean } = {},
): Promise<SyncRunResult> {
  const now = options.now ?? new Date();
  const syncedAt = now.toISOString();
  const summary: SyncRunResult = {
    attempted: 0,
    accepted: 0,
    needsReview: 0,
    rejected: 0,
    retryable: 0,
    cursor: await readSyncCursor(db),
    syncedAt,
  };
  if (options.online === false) return summary;

  await recoverInterruptedSends(db, now);

  for (;;) {
    const due = await dueOutboxEvents(db, now, OUTBOX_BATCH_SIZE);
    if (due.length === 0) break;
    summary.attempted += due.length;
    await markOutboxSending(
      db,
      due.map((event) => event.operationId),
    );

    let response: SyncPushResponse;
    try {
      response = await transport.push({ device, events: due.map(toSyncEvent) });
    } catch (error) {
      for (const event of due) {
        await markOutboxRetryable(db, event.operationId, error, now);
      }
      summary.retryable += due.length;
      return summary;
    }

    const results = new Map(response.results.map((result) => [result.operationId, result]));
    for (const event of due) {
      const result = results.get(event.operationId);
      if (!result) {
        await markOutboxRetryable(
          db,
          event.operationId,
          new Error('Server did not acknowledge this operation'),
          now,
        );
        summary.retryable += 1;
        continue;
      }
      await applyPushResult(db, result);
      if (result.status === 'accepted' || result.status === 'duplicate') summary.accepted += 1;
      else if (result.status === 'needs_review') summary.needsReview += 1;
      else summary.rejected += 1;
    }

    if (due.length < OUTBOX_BATCH_SIZE) break;
  }

  const cursor = await readSyncCursor(db);
  const pulled = await transport.pull({ deviceId: device.id, cursor });

  for (const item of pulled.items) {
    const sale = await db.localSales.get(item.entityId);
    if (!sale) continue;
    if (item.status === 'accepted' || item.status === 'duplicate') {
      await db.localSales.put({
        ...sale,
        status: 'server_accepted',
        serverSaleId: item.sale?.id ?? sale.serverSaleId,
        serverSaleNumber: item.sale?.saleNumber ?? sale.serverSaleNumber,
        conflictReason: null,
      });
    } else if (item.status === 'needs_review') {
      await db.localSales.put({
        ...sale,
        status: 'requires_review',
        conflictReason: item.conflictReason,
      });
    } else {
      await db.localSales.put({
        ...sale,
        status: 'rejected',
        conflictReason: item.conflictReason,
      });
    }
  }

  await writeSyncCursor(db, pulled.cursor, pulled.serverTime);
  summary.cursor = pulled.cursor;
  summary.syncedAt = pulled.serverTime;
  return summary;
}

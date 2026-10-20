import type { SyncPushResult } from '@pos/contracts';

import type { PosOfflineDatabase } from './db';
import type { OutboxEvent, SyncSummary } from './types';

export const OUTBOX_BASE_DELAY_MS = 5_000;
export const OUTBOX_MAX_DELAY_MS = 5 * 60_000;
export const OUTBOX_BATCH_SIZE = 20;

/** Exponential backoff with jitter; retries never run before the base delay. */
export function backoffDelayMs(attempts: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, Math.min(attempts, 10));
  const base = Math.min(OUTBOX_BASE_DELAY_MS * 2 ** exponent, OUTBOX_MAX_DELAY_MS);
  const jitter = 0.5 + random();
  return Math.max(OUTBOX_BASE_DELAY_MS, Math.round(base * jitter));
}

export async function dueOutboxEvents(
  db: PosOfflineDatabase,
  now = new Date(),
  limit = OUTBOX_BATCH_SIZE,
): Promise<OutboxEvent[]> {
  const nowIso = now.toISOString();
  const events = await db.outbox.where('status').anyOf('pending', 'retryable_error').toArray();
  return events
    .filter((event) => event.nextAttemptAt <= nowIso)
    .sort((a, b) => a.clientSequence - b.clientSequence)
    .slice(0, limit);
}

/** Recover events left in `sending` by a crash or forced browser close. */
export async function recoverInterruptedSends(
  db: PosOfflineDatabase,
  now = new Date(),
): Promise<number> {
  const stuck = await db.outbox.where('status').equals('sending').toArray();
  if (stuck.length === 0) return 0;
  await db.outbox.bulkPut(
    stuck.map((event) => ({
      ...event,
      status: 'retryable_error' as const,
      nextAttemptAt: now.toISOString(),
      lastError: 'Sync interrupted before acknowledgement',
    })),
  );
  return stuck.length;
}

export async function markOutboxSending(
  db: PosOfflineDatabase,
  operationIds: readonly string[],
): Promise<void> {
  const events = await db.outbox.bulkGet([...operationIds]);
  const updates = events
    .filter((event): event is OutboxEvent => Boolean(event))
    .map((event) => ({ ...event, status: 'sending' as const }));
  if (updates.length > 0) await db.outbox.bulkPut(updates);
}

export async function applyPushResult(
  db: PosOfflineDatabase,
  result: SyncPushResult,
): Promise<void> {
  await db.transaction('rw', db.outbox, db.localSales, async () => {
    const event = await db.outbox.get(result.operationId);
    if (!event) return;
    const sale = await db.localSales.get(result.entityId);

    if (result.status === 'accepted' || result.status === 'duplicate') {
      await db.outbox.put({
        ...event,
        status: 'acknowledged',
        lastError: null,
        payload: event.payload,
      });
      if (sale) {
        await db.localSales.put({
          ...sale,
          status: 'server_accepted',
          serverSaleId: result.sale?.id ?? sale.serverSaleId,
          serverSaleNumber: result.sale?.saleNumber ?? sale.serverSaleNumber,
          conflictReason: null,
        });
      }
      return;
    }

    if (result.status === 'needs_review') {
      await db.outbox.put({
        ...event,
        status: 'needs_review',
        lastError: result.message,
        payload: event.payload,
      });
      if (sale) {
        await db.localSales.put({
          ...sale,
          status: 'requires_review',
          conflictReason: result.conflictReason,
        });
      }
      return;
    }

    await db.outbox.put({
      ...event,
      status: 'rejected',
      lastError: result.message,
      payload: event.payload,
    });
    if (sale) {
      await db.localSales.put({
        ...sale,
        status: 'rejected',
        conflictReason: result.conflictReason,
      });
    }
  });
}

export async function markOutboxRetryable(
  db: PosOfflineDatabase,
  operationId: string,
  error: unknown,
  now = new Date(),
): Promise<void> {
  const event = await db.outbox.get(operationId);
  if (!event) return;
  const attempts = event.attempts + 1;
  await db.outbox.put({
    ...event,
    status: 'retryable_error',
    attempts,
    nextAttemptAt: new Date(now.getTime() + backoffDelayMs(attempts - 1)).toISOString(),
    lastError: error instanceof Error ? error.message : String(error),
  });
}

export async function outboxSummary(db: PosOfflineDatabase): Promise<SyncSummary> {
  const events = await db.outbox.toArray();
  const summary: SyncSummary = {
    pending: 0,
    retryable: 0,
    needsReview: 0,
    rejected: 0,
    acknowledged: 0,
  };
  for (const event of events) {
    if (event.status === 'pending' || event.status === 'sending') summary.pending += 1;
    else if (event.status === 'retryable_error') summary.retryable += 1;
    else if (event.status === 'needs_review') summary.needsReview += 1;
    else if (event.status === 'rejected') summary.rejected += 1;
    else summary.acknowledged += 1;
  }
  return summary;
}

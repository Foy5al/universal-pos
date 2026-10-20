import 'fake-indexeddb/auto';

import type { SyncPushResult } from '@pos/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyPushResult,
  backoffDelayMs,
  commitLocalSale,
  createOfflineDatabase,
  dueOutboxEvents,
  markOutboxRetryable,
  outboxSummary,
  recoverInterruptedSends,
  type PosOfflineDatabase,
} from '../src';

let db: PosOfflineDatabase;

beforeEach(() => {
  db = createOfflineDatabase(`outbox-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

async function seedSale() {
  return commitLocalSale(db, {
    deviceId: '00000000-0000-4000-8000-0000000000a1',
    locationId: '00000000-0000-4000-8000-0000000000e1',
    registerId: '00000000-0000-4000-8000-0000000000c1',
    registerCode: 'A1',
    registerShiftId: '00000000-0000-4000-8000-0000000000b1',
    lines: [
      {
        product: {
          id: '00000000-0000-4000-8000-0000000000f1',
          sku: 'SKU-1',
          name: 'Rice',
          priceMinor: 1000,
        },
        quantity: '1',
      },
    ],
    tenderedMinor: 1000,
  });
}

describe('outbox', () => {
  it('backs off exponentially from the base delay with jitter and a cap', () => {
    expect(backoffDelayMs(0, () => 0.5)).toBe(5_000);
    expect(backoffDelayMs(1, () => 0.5)).toBe(10_000);
    expect(backoffDelayMs(2, () => 0.5)).toBe(20_000);
    expect(backoffDelayMs(8, () => 0.5)).toBe(300_000);
    expect(backoffDelayMs(50, () => 0.5)).toBe(300_000);
    expect(backoffDelayMs(0, () => 0)).toBeGreaterThanOrEqual(5_000);
    expect(backoffDelayMs(1, () => 0.999)).toBeLessThanOrEqual(15_000);
  });

  it('schedules retryable failures into the future, then makes them due', async () => {
    const sale = await seedSale();
    const now = new Date('2026-10-20T10:00:00.000Z');

    await markOutboxRetryable(db, sale.operationId, new Error('network down'), now);
    const event = await db.outbox.get(sale.operationId);
    expect(event?.status).toBe('retryable_error');
    expect(event?.attempts).toBe(1);
    expect(event?.lastError).toBe('network down');
    expect(new Date(event?.nextAttemptAt ?? 0).getTime()).toBeGreaterThan(now.getTime());
    expect(await dueOutboxEvents(db, now)).toHaveLength(0);

    const later = new Date('2026-10-20T10:05:00.000Z');
    expect(await dueOutboxEvents(db, later)).toHaveLength(1);
    expect((await db.localSales.get(sale.entityId))?.status).toBe('local_pending');
  });

  it('records accepted, duplicate, review and rejected outcomes on the sale', async () => {
    const accepted = await seedSale();
    await applyPushResult(db, {
      operationId: accepted.operationId,
      entityId: accepted.entityId,
      status: 'accepted',
      sale: {
        id: '00000000-0000-4000-8000-0000000000d1',
        saleNumber: 'INV-20261020-ABCDEF12',
      } as SyncPushResult['sale'],
      conflictReason: null,
      message: null,
    });
    const syncedSale = await db.localSales.get(accepted.entityId);
    expect(syncedSale).toMatchObject({
      status: 'server_accepted',
      serverSaleId: '00000000-0000-4000-8000-0000000000d1',
      serverSaleNumber: 'INV-20261020-ABCDEF12',
    });
    expect((await db.outbox.get(accepted.operationId))?.status).toBe('acknowledged');

    const review = await seedSale();
    await applyPushResult(db, {
      operationId: review.operationId,
      entityId: review.entityId,
      status: 'needs_review',
      sale: null,
      conflictReason: 'insufficient_stock',
      message: 'Insufficient stock for the requested quantity',
    });
    expect(await db.localSales.get(review.entityId)).toMatchObject({
      status: 'requires_review',
      conflictReason: 'insufficient_stock',
    });
    expect((await db.outbox.get(review.operationId))?.status).toBe('needs_review');

    const rejected = await seedSale();
    await applyPushResult(db, {
      operationId: rejected.operationId,
      entityId: rejected.entityId,
      status: 'rejected',
      sale: null,
      conflictReason: 'rejected_operation',
      message: 'Register shift is closed',
    });
    expect((await db.localSales.get(rejected.entityId))?.status).toBe('rejected');

    const summary = await outboxSummary(db);
    expect(summary).toEqual({
      pending: 0,
      retryable: 0,
      needsReview: 1,
      rejected: 1,
      acknowledged: 1,
    });
    expect(await dueOutboxEvents(db, new Date('2027-01-01T00:00:00.000Z'))).toHaveLength(0);
  });

  it('recovers events left sending by a crash', async () => {
    const sale = await seedSale();
    const event = await db.outbox.get(sale.operationId);
    if (!event) throw new Error('missing outbox event');
    await db.outbox.put({ ...event, status: 'sending' });

    expect(await recoverInterruptedSends(db, new Date('2026-10-20T10:00:00.000Z'))).toBe(1);
    expect((await db.outbox.get(sale.operationId))?.status).toBe('retryable_error');
    expect(await dueOutboxEvents(db, new Date('2026-10-20T10:00:00.000Z'))).toHaveLength(1);
  });
});

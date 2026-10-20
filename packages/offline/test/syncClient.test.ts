import 'fake-indexeddb/auto';

import type {
  RegisterDeviceRequest,
  Sale,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
} from '@pos/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  commitLocalSale,
  createOfflineDatabase,
  outboxSummary,
  readSyncCursor,
  runSync,
  type PosOfflineDatabase,
  type SyncTransport,
} from '../src';

const device: RegisterDeviceRequest = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'Till 1',
  platform: 'web',
};

const serverSale = {
  id: '00000000-0000-4000-8000-0000000000d1',
  saleNumber: 'INV-20261020-ABCDEF12',
} as unknown as Sale;

let db: PosOfflineDatabase;

beforeEach(() => {
  db = createOfflineDatabase(`sync-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

async function seedSale() {
  return commitLocalSale(db, {
    deviceId: device.id,
    locationId: '00000000-0000-4000-8000-0000000000e1',
    registerId: '00000000-0000-4000-8000-0000000000c1',
    registerCode: 'A1',
    registerShiftId: '00000000-0000-4000-8000-0000000000b1',
    occurredAt: '2026-10-20T09:00:00.000Z',
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

class FakeTransport implements SyncTransport {
  pushes: SyncPushRequest[] = [];
  pulls = 0;
  failures = 0;
  review = false;

  async push(request: SyncPushRequest): Promise<SyncPushResponse> {
    this.pushes.push(request);
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('Network unavailable');
    }
    return {
      serverTime: '2026-10-20T10:00:05.000Z',
      results: request.events.map((event) => ({
        operationId: event.operationId,
        entityId: event.entityId,
        status: this.review ? ('needs_review' as const) : ('accepted' as const),
        sale: this.review ? null : serverSale,
        conflictReason: this.review ? 'insufficient_stock' : null,
        message: this.review ? 'Insufficient stock for the requested quantity' : null,
      })),
    };
  }

  async pull(): Promise<SyncPullResponse> {
    this.pulls += 1;
    return { cursor: 1, serverTime: '2026-10-20T10:00:06.000Z', items: [] };
  }
}

describe('sync engine', () => {
  it('pushes pending events in order, then pulls canonical results', async () => {
    const first = await seedSale();
    const second = await seedSale();
    const transport = new FakeTransport();

    const result = await runSync(db, device, transport, {
      now: new Date('2026-10-20T10:00:00.000Z'),
    });

    expect(result).toMatchObject({
      attempted: 2,
      accepted: 2,
      needsReview: 0,
      rejected: 0,
      retryable: 0,
      cursor: 1,
    });
    expect(transport.pushes).toHaveLength(1);
    expect(transport.pushes[0]?.events.map((event) => event.clientSequence)).toEqual([1, 2]);
    expect(transport.pushes[0]?.events[0]?.payload.provisionalNumber).toBe('OFF-A1-1');
    expect(transport.pushes[0]?.events[0]?.deviceId).toBe(device.id);
    expect(transport.pulls).toBe(1);

    for (const id of [first.entityId, second.entityId]) {
      expect(await db.localSales.get(id)).toMatchObject({
        status: 'server_accepted',
        serverSaleId: serverSale.id,
        serverSaleNumber: serverSale.saleNumber,
      });
    }
    expect(await readSyncCursor(db)).toBe(1);
    expect((await outboxSummary(db)).acknowledged).toBe(2);
  });

  it('keeps sales queued when the network fails, then retries later', async () => {
    const sale = await seedSale();
    const transport = new FakeTransport();
    transport.failures = 1;
    const now = new Date('2026-10-20T10:00:00.000Z');

    const failed = await runSync(db, device, transport, { now });
    expect(failed.retryable).toBe(1);
    expect(transport.pulls).toBe(0);
    expect((await db.outbox.get(sale.operationId))?.status).toBe('retryable_error');
    expect((await db.localSales.get(sale.entityId))?.status).toBe('local_pending');

    const retried = await runSync(db, device, transport, {
      now: new Date('2026-10-20T10:05:00.000Z'),
    });
    expect(retried.accepted).toBe(1);
    expect((await db.outbox.get(sale.operationId))?.status).toBe('acknowledged');
  });

  it('marks reviewed operations as needs review without losing the local sale', async () => {
    const sale = await seedSale();
    const transport = new FakeTransport();
    transport.review = true;

    const result = await runSync(db, device, transport, {
      now: new Date('2026-10-20T10:00:00.000Z'),
    });

    expect(result.needsReview).toBe(1);
    expect(await db.localSales.get(sale.entityId)).toMatchObject({
      status: 'requires_review',
      conflictReason: 'insufficient_stock',
      serverSaleId: null,
    });
    expect((await outboxSummary(db)).needsReview).toBe(1);
  });

  it('does nothing while the browser reports offline', async () => {
    await seedSale();
    const transport = new FakeTransport();

    const result = await runSync(db, device, transport, {
      now: new Date('2026-10-20T10:00:00.000Z'),
      online: false,
    });

    expect(result.attempted).toBe(0);
    expect(transport.pushes).toHaveLength(0);
    expect(transport.pulls).toBe(0);
  });
});

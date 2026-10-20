import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  commitLocalSale,
  createOfflineDatabase,
  lineTotalMinor,
  outboxSummary,
  scaledQuantity,
  type PosOfflineDatabase,
} from '../src';

const DEVICE_ID = '00000000-0000-4000-8000-0000000000a1';
const LOCATION_ID = '00000000-0000-4000-8000-0000000000e1';
const REGISTER_ID = '00000000-0000-4000-8000-0000000000c1';
const SHIFT_ID = '00000000-0000-4000-8000-0000000000b1';
const PRODUCT_ID = '00000000-0000-4000-8000-0000000000f1';

const product = { id: PRODUCT_ID, sku: 'SKU-1', name: 'Rice', priceMinor: 1250 };

let db: PosOfflineDatabase;

beforeEach(() => {
  db = createOfflineDatabase(`checkout-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

function checkoutInput(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: DEVICE_ID,
    locationId: LOCATION_ID,
    registerId: REGISTER_ID,
    registerCode: 'A1',
    registerShiftId: SHIFT_ID,
    lines: [{ product, quantity: '2.5' }],
    tenderedMinor: 5000,
    ...overrides,
  };
}

describe('local checkout', () => {
  it('writes the sale, its lines and the outbox event in one transaction', async () => {
    const sale = await commitLocalSale(db, checkoutInput());

    expect(sale.status).toBe('local_pending');
    expect(sale.provisionalNumber).toBe('OFF-A1-1');
    expect(sale.subtotalMinor).toBe(3125);
    expect(sale.changeMinor).toBe(1875);
    expect(sale.lines[0]).toMatchObject({
      sku: 'SKU-1',
      name: 'Rice',
      quantity: '2.5',
      unitPriceMinor: 1250,
      lineTotalMinor: 3125,
    });

    expect(await db.localSales.count()).toBe(1);
    const events = await db.outbox.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      operationId: sale.operationId,
      entityId: sale.entityId,
      status: 'pending',
      clientSequence: 1,
    });
    expect(events[0]?.payload.provisionalNumber).toBe('OFF-A1-1');
    expect(events[0]?.payload.lines[0]).toEqual({
      productId: PRODUCT_ID,
      quantity: '2.5',
      unitPriceMinor: 1250,
    });
  });

  it('increments the provisional receipt sequence per device', async () => {
    const first = await commitLocalSale(db, checkoutInput());
    const second = await commitLocalSale(db, checkoutInput());
    expect(first.provisionalNumber).toBe('OFF-A1-1');
    expect(second.provisionalNumber).toBe('OFF-A1-2');
    expect(second.clientSequence).toBe(2);

    const summary = await outboxSummary(db);
    expect(summary.pending).toBe(2);
  });

  it('rejects underpayment and duplicate product lines without writing anything', async () => {
    await expect(commitLocalSale(db, checkoutInput({ tenderedMinor: 3000 }))).rejects.toThrow(
      /less than the sale total/,
    );
    await expect(
      commitLocalSale(
        db,
        checkoutInput({
          lines: [
            { product, quantity: '1' },
            { product, quantity: '2' },
          ],
        }),
      ),
    ).rejects.toThrow(/only once/);

    expect(await db.localSales.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('uses exact decimal quantity and half-up money rounding', () => {
    expect(scaledQuantity('2.5')).toBe(25_000n);
    expect(lineTotalMinor(1250, '2.5')).toBe(3125);
    expect(lineTotalMinor(12345, '0.0001')).toBe(1);
    expect(lineTotalMinor(999, '3')).toBe(2997);
    expect(() => lineTotalMinor(1000, '0')).toThrow(/Invalid quantity/);
    expect(() => lineTotalMinor(1000, '-1')).toThrow(/Invalid quantity/);
    expect(() => lineTotalMinor(1000, '1.00001')).toThrow(/Invalid quantity/);
  });
});

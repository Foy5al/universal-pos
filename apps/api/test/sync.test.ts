import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  ORG_B,
  PRODUCT_A,
  STORE_A,
  createSalesFixture,
  type SalesFixture,
} from './support/salesFixture';

const OCCURRED_AT = '2026-10-20T10:00:00.000Z';

describe('offline sync API', () => {
  let app: SalesFixture['app'];
  let auth: SalesFixture['auth'];
  let shifts: SalesFixture['shifts'];
  let stockOf: SalesFixture['stockOf'];
  let sequence = 0;
  let deviceId = '';

  function buildEvent(overrides: Record<string, unknown> = {}) {
    sequence += 1;
    const operationId = randomUUID();
    return {
      operationId,
      entityId: randomUUID(),
      entityType: 'sale',
      eventType: 'sale.completed',
      deviceId,
      clientSequence: sequence,
      occurredAt: OCCURRED_AT,
      payloadVersion: 1,
      payload: {
        locationId: LOCATION_A,
        registerShiftId: shifts[ORG_A],
        provisionalNumber: `OFF-A1-${sequence}`,
        lines: [{ productId: PRODUCT_A, quantity: '2', unitPriceMinor: 1000 }],
        payments: [{ method: 'cash', tenderedMinor: 2500 }],
      },
      ...overrides,
    };
  }

  function push(email: string, events: unknown[], device = {}) {
    return request(app)
      .post('/v1/sync/push')
      .set('authorization', auth(email))
      .send({
        device: {
          id: deviceId,
          name: 'Till 1',
          platform: 'web',
          ...device,
        },
        events,
      });
  }

  beforeAll(async () => {
    const fixture = await createSalesFixture();
    app = fixture.app;
    auth = fixture.auth;
    shifts = fixture.shifts;
    stockOf = fixture.stockOf;
    deviceId = randomUUID();
  });

  it('requires authentication and the sync permissions', async () => {
    await request(app)
      .post('/v1/sync/push')
      .send({ device: { id: deviceId, name: 'Till 1', platform: 'web' }, events: [buildEvent()] })
      .expect(401);

    await push('viewer-a@example.com', [buildEvent()]).expect(403);
    await request(app)
      .get('/v1/sync/pull')
      .query({ deviceId })
      .set('authorization', auth('viewer-a@example.com'))
      .expect(403);
  });

  it('enrolls the device on first push and posts the captured offline price', async () => {
    const before = Number(await stockOf());
    const event = buildEvent({
      payload: {
        locationId: LOCATION_A,
        registerShiftId: shifts[ORG_A],
        provisionalNumber: 'OFF-A1-1',
        lines: [{ productId: PRODUCT_A, quantity: '2', unitPriceMinor: 900 }],
        payments: [{ method: 'cash', tenderedMinor: 2000 }],
      },
    });

    const res = await push('cashier-a@example.com', [event]).expect(200);
    const result = res.body.data.results[0];
    expect(result.status).toBe('accepted');
    expect(result.sale.saleNumber).toMatch(/^INV-\d{8}-[0-9A-F]{8}$/);
    expect(result.sale.totalMinor).toBe(1800);
    expect(result.sale.lines[0].unitPriceMinor).toBe(900);
    expect(result.sale.operationId).toBe(event.operationId);
    expect(Number(await stockOf())).toBe(before - 2);

    const devices = await request(app)
      .get('/v1/devices')
      .set('authorization', auth('cashier-a@example.com'))
      .expect(200);
    expect(devices.body.data).toHaveLength(1);
    expect(devices.body.data[0]).toMatchObject({ id: deviceId, storeId: STORE_A, revokedAt: null });
  });

  it('posts one sale when the same operation is pushed ten times', async () => {
    const before = Number(await stockOf());
    const event = buildEvent();

    const statuses: string[] = [];
    const saleIds: string[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await push('cashier-a@example.com', [event]).expect(200);
      statuses.push(res.body.data.results[0].status);
      saleIds.push(res.body.data.results[0].sale.id);
    }

    expect(statuses[0]).toBe('accepted');
    expect(statuses.slice(1)).toEqual(Array(9).fill('duplicate'));
    expect(new Set(saleIds).size).toBe(1);
    expect(Number(await stockOf())).toBe(before - 2);
  });

  it('keeps an oversold offline sale for review instead of dropping it', async () => {
    const event = buildEvent({
      payload: {
        locationId: LOCATION_A,
        registerShiftId: shifts[ORG_A],
        provisionalNumber: 'OFF-A1-oversold',
        lines: [{ productId: PRODUCT_A, quantity: '10000', unitPriceMinor: 1000 }],
        payments: [{ method: 'cash', tenderedMinor: 10_000_000 }],
      },
    });

    const res = await push('cashier-a@example.com', [event]).expect(200);
    expect(res.body.data.results[0]).toMatchObject({
      status: 'needs_review',
      conflictReason: 'insufficient_stock',
      sale: null,
    });

    const conflicts = await request(app)
      .get('/v1/sync/conflicts')
      .set('authorization', auth('manager-a@example.com'))
      .expect(200);
    expect(conflicts.body.data).toHaveLength(1);
    expect(conflicts.body.data[0]).toMatchObject({
      operationId: event.operationId,
      reason: 'insufficient_stock',
    });

    const pulled = await request(app)
      .get('/v1/sync/pull')
      .query({ deviceId })
      .set('authorization', auth('cashier-a@example.com'))
      .expect(200);
    const reviewItem = pulled.body.data.items.find(
      (item: { operationId: string }) => item.operationId === event.operationId,
    );
    expect(reviewItem).toMatchObject({
      status: 'needs_review',
      conflictReason: 'insufficient_stock',
    });
  });

  it('pulls acknowledged operations incrementally with a stable cursor', async () => {
    const first = await request(app)
      .get('/v1/sync/pull')
      .query({ deviceId })
      .set('authorization', auth('cashier-a@example.com'))
      .expect(200);
    const items = first.body.data.items as Array<{ sequence: number; sale: unknown }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.sale).not.toBeNull();
    const cursor = first.body.data.cursor as number;
    expect(cursor).toBe(items[items.length - 1]?.sequence);

    const second = await request(app)
      .get('/v1/sync/pull')
      .query({ deviceId, cursor })
      .set('authorization', auth('cashier-a@example.com'))
      .expect(200);
    expect(second.body.data.items).toHaveLength(0);
    expect(second.body.data.cursor).toBe(cursor);
  });

  it('rejects events and devices from another organization', async () => {
    await push('cashier-a@example.com', [buildEvent()], { storeId: STORE_A }).expect(200);

    const foreignLocation = await push('cashier-a@example.com', [
      buildEvent({
        payload: {
          locationId: LOCATION_B,
          registerShiftId: shifts[ORG_B],
          provisionalNumber: 'OFF-B1-1',
          lines: [{ productId: PRODUCT_A, quantity: '1', unitPriceMinor: 1000 }],
          payments: [{ method: 'cash', tenderedMinor: 1000 }],
        },
      }),
    ]).expect(404);
    expect(foreignLocation.body.error.code).toBe('not_found');

    const mismatchedDevice = await push('cashier-a@example.com', [
      buildEvent({ deviceId: randomUUID() }),
    ]).expect(422);
    expect(mismatchedDevice.body.error.code).toBe('validation_error');

    const devicesA = await request(app)
      .get('/v1/devices')
      .set('authorization', auth('cashier-a@example.com'))
      .expect(200);
    expect(
      devicesA.body.data.every(
        (device: { organizationId: string }) => device.organizationId === ORG_A,
      ),
    ).toBe(true);
  });

  it('blocks push from a revoked device and requires devices:manage to revoke', async () => {
    const revokedDeviceId = randomUUID();
    const event = buildEvent({ deviceId: revokedDeviceId });
    deviceId = revokedDeviceId;
    await push('cashier-a@example.com', [event]).expect(200);

    await request(app)
      .post(`/v1/devices/${revokedDeviceId}/revoke`)
      .set('authorization', auth('cashier-a@example.com'))
      .expect(403);

    const revoked = await request(app)
      .post(`/v1/devices/${revokedDeviceId}/revoke`)
      .set('authorization', auth('manager-a@example.com'))
      .expect(200);
    expect(revoked.body.data.revokedAt).not.toBeNull();

    const blocked = await push('cashier-a@example.com', [buildEvent()]).expect(403);
    expect(blocked.body.error.code).toBe('forbidden');

    await request(app)
      .post('/v1/devices')
      .set('authorization', auth('manager-a@example.com'))
      .send({ id: randomUUID(), name: 'Back office', platform: 'web', storeId: STORE_A })
      .expect(201);
  });
});

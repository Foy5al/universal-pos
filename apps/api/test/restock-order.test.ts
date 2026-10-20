import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  LOCATION_A,
  LOCATION_SCOPED_A,
  PRODUCT_A,
  PRODUCT_A2,
  createRestockFixture,
  type RestockFixture,
} from './support/restockFixture';

describe('restock purchase order and GRN', () => {
  let app: RestockFixture['app'];
  let auth: RestockFixture['auth'];
  let createRequest: RestockFixture['createRequest'];
  let createSupplier: RestockFixture['createSupplier'];
  let pendingRequest: RestockFixture['pendingRequest'];

  beforeAll(async () => {
    const fixture = await createRestockFixture();
    app = fixture.app;
    auth = fixture.auth;
    createRequest = fixture.createRequest;
    createSupplier = fixture.createSupplier;
    pendingRequest = fixture.pendingRequest;
  });

  it('schedules requests from a purchase order and fulfils them on full GRN', async () => {
    const requestId = await pendingRequest('3');
    const supplierId = await createSupplier('Restock Supply');

    const created = await request(app)
      .post('/v1/purchases/orders')
      .set('authorization', auth('manager-a@example.com'))
      .send({
        supplierId,
        locationId: LOCATION_A,
        restockRequestIds: [requestId],
        lines: [{ productId: PRODUCT_A, quantity: '3', unitCostMinor: 600 }],
      })
      .expect(201);
    const orderId = created.body.data.id as string;
    const lineId = created.body.data.lines[0].id as string;

    const scheduled = await request(app)
      .get('/v1/restock-requests?status=scheduled')
      .set('authorization', auth('manager-a@example.com'))
      .expect(200);
    expect(scheduled.body.data.items[0]).toMatchObject({
      id: requestId,
      status: 'scheduled',
      purchaseOrderId: orderId,
      purchaseOrderLineId: lineId,
    });

    await request(app)
      .patch(`/v1/purchases/orders/${orderId}/status`)
      .set('authorization', auth('manager-a@example.com'))
      .send({ status: 'ordered' })
      .expect(200);

    await request(app)
      .post(`/v1/purchases/orders/${orderId}/receipts`)
      .set('authorization', auth('manager-a@example.com'))
      .send({ lines: [{ purchaseOrderLineId: lineId, quantity: '1' }] })
      .expect(201);

    const partial = await request(app)
      .get('/v1/restock-requests?status=scheduled')
      .set('authorization', auth('manager-a@example.com'))
      .expect(200);
    expect(partial.body.data.items.map((item: { id: string }) => item.id)).toContain(requestId);

    await request(app)
      .post(`/v1/purchases/orders/${orderId}/receipts`)
      .set('authorization', auth('manager-a@example.com'))
      .send({ lines: [{ purchaseOrderLineId: lineId, quantity: '2' }] })
      .expect(201);

    const fulfilled = await request(app)
      .get('/v1/restock-requests?status=fulfilled')
      .set('authorization', auth('manager-a@example.com'))
      .expect(200);
    expect(fulfilled.body.data.items.map((item: { id: string }) => item.id)).toContain(requestId);

    const balances = await request(app)
      .get(`/v1/inventory/balances?locationId=${LOCATION_A}&productId=${PRODUCT_A}`)
      .set('authorization', auth('cashier-a@example.com'))
      .expect(200);
    expect(Number(balances.body.data.items[0].quantity)).toBeGreaterThanOrEqual(3);
  });

  it('releases scheduled requests when the order is cancelled', async () => {
    const requestId = await pendingRequest('4');
    const supplierId = await createSupplier('Cancelled Supply');
    const created = await request(app)
      .post('/v1/purchases/orders')
      .set('authorization', auth('manager-a@example.com'))
      .send({
        supplierId,
        locationId: LOCATION_A,
        restockRequestIds: [requestId],
        lines: [{ productId: PRODUCT_A, quantity: '4', unitCostMinor: 600 }],
      })
      .expect(201);

    await request(app)
      .patch(`/v1/purchases/orders/${created.body.data.id as string}/status`)
      .set('authorization', auth('manager-a@example.com'))
      .send({ status: 'cancelled' })
      .expect(200);

    const pending = await request(app)
      .get('/v1/restock-requests?status=pending')
      .set('authorization', auth('manager-a@example.com'))
      .expect(200);
    const released = pending.body.data.items.find((item: { id: string }) => item.id === requestId);
    expect(released).toMatchObject({ purchaseOrderId: null, purchaseOrderLineId: null });
  });

  it('rejects requests from a different location or without a matching order line', async () => {
    const main = await pendingRequest('1');
    const scoped = await createRequest('cashier-a@example.com', {
      locationId: LOCATION_SCOPED_A,
      quantity: '1',
    }).expect(201);
    const supplierId = await createSupplier('Mixed Supplier');

    await request(app)
      .post('/v1/purchases/orders')
      .set('authorization', auth('manager-a@example.com'))
      .send({
        supplierId,
        locationId: LOCATION_A,
        restockRequestIds: [main, scoped.body.data.id as string],
        lines: [{ productId: PRODUCT_A, quantity: '2', unitCostMinor: 600 }],
      })
      .expect(422);

    const otherProduct = await createRequest('cashier-a@example.com', {
      productId: PRODUCT_A2,
      quantity: '1',
    }).expect(201);

    await request(app)
      .post('/v1/purchases/orders')
      .set('authorization', auth('manager-a@example.com'))
      .send({
        supplierId,
        locationId: LOCATION_A,
        restockRequestIds: [otherProduct.body.data.id as string],
        lines: [{ productId: PRODUCT_A, quantity: '1', unitCostMinor: 600 }],
      })
      .expect(422);
  });

  it('limits conversion to the manager store scope', async () => {
    const scoped = await createRequest('cashier-a@example.com', {
      locationId: LOCATION_SCOPED_A,
      quantity: '1',
    }).expect(201);
    const scopedSupplier = await request(app)
      .post('/v1/purchases/suppliers')
      .set('authorization', auth('scoped-a@example.com'))
      .send({ name: 'Scoped Supplier' })
      .expect(201);

    await request(app)
      .post('/v1/purchases/orders')
      .set('authorization', auth('scoped-a@example.com'))
      .send({
        supplierId: scopedSupplier.body.data.id as string,
        locationId: LOCATION_SCOPED_A,
        restockRequestIds: [scoped.body.data.id as string],
        lines: [{ productId: PRODUCT_A, quantity: '1', unitCostMinor: 600 }],
      })
      .expect(201);

    const mainRequest = await pendingRequest('1');
    const mainSupplier = await createSupplier('Scope Check Supply');
    await request(app)
      .post('/v1/purchases/orders')
      .set('authorization', auth('scoped-a@example.com'))
      .send({
        supplierId: mainSupplier,
        locationId: LOCATION_A,
        restockRequestIds: [mainRequest],
        lines: [{ productId: PRODUCT_A, quantity: '1', unitCostMinor: 600 }],
      })
      .expect(404);
  });
});

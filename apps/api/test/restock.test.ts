import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  CASHIER_A,
  LOCATION_A,
  ORG_A,
  PRODUCT_A,
  PRODUCT_B,
  createRestockFixture,
  type RestockFixture,
} from './support/restockFixture';

describe('restock request review', () => {
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

  it('lets a POS operator raise a request and a manager read it', async () => {
    await request(app).post('/v1/restock-requests').send({}).expect(401);

    const res = await createRequest('cashier-a@example.com').expect(201);
    expect(res.body.data).toMatchObject({
      organizationId: ORG_A,
      locationId: LOCATION_A,
      productId: PRODUCT_A,
      requestedByUserId: CASHIER_A,
      requestedByName: 'Cashier A',
      requestedQuantity: '5',
      status: 'pending',
      purchaseOrderId: null,
    });

    const seen = await request(app)
      .get('/v1/restock-requests?status=pending')
      .set('authorization', auth('manager-a@example.com'))
      .expect(200);
    expect(seen.body.data.items.map((item: { id: string }) => item.id)).toContain(res.body.data.id);

    await createRequest('viewer-a@example.com').expect(403);
    await createRequest('cashier-a@example.com', { productId: PRODUCT_B }).expect(404);
    await createRequest('cashier-b@example.com').expect(404);
  });

  it('scopes requests to the caller organization', async () => {
    const foreign = await request(app)
      .get('/v1/restock-requests')
      .set('authorization', auth('manager-b@example.com'))
      .expect(200);
    expect(foreign.body.data.total).toBe(0);
  });

  it('lets a manager dismiss a pending request but not a clerk', async () => {
    const id = await pendingRequest('2');

    await request(app)
      .patch(`/v1/restock-requests/${id}`)
      .set('authorization', auth('viewer-a@example.com'))
      .send({ status: 'dismissed' })
      .expect(403);

    const dismissed = await request(app)
      .patch(`/v1/restock-requests/${id}`)
      .set('authorization', auth('manager-a@example.com'))
      .send({ status: 'dismissed' })
      .expect(200);
    expect(dismissed.body.data.status).toBe('dismissed');

    await request(app)
      .patch(`/v1/restock-requests/${id}`)
      .set('authorization', auth('manager-a@example.com'))
      .send({ status: 'dismissed' })
      .expect(409);

    const supplierId = await createSupplier('Dismissed Supplier');
    await request(app)
      .post('/v1/purchases/orders')
      .set('authorization', auth('manager-a@example.com'))
      .send({
        supplierId,
        locationId: LOCATION_A,
        restockRequestIds: [id],
        lines: [{ productId: PRODUCT_A, quantity: '2', unitCostMinor: 600 }],
      })
      .expect(409);
  });
});

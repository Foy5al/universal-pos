import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  LOCATION_B,
  ORG_A,
  ORG_B,
  PRODUCT_A,
  PRODUCT_B,
  REGISTER_A,
  createSalesFixture,
  type SalesFixture,
} from './support/salesFixture';

describe('refunds API', () => {
  let app: SalesFixture['app'];
  let auth: SalesFixture['auth'];
  let saleBody: SalesFixture['saleBody'];
  let createSale: SalesFixture['createSale'];
  let stockOf: SalesFixture['stockOf'];
  let shifts: SalesFixture['shifts'];

  beforeAll(async () => {
    const fixture = await createSalesFixture();
    app = fixture.app;
    auth = fixture.auth;
    saleBody = fixture.saleBody;
    createSale = fixture.createSale;
    stockOf = fixture.stockOf;
    shifts = fixture.shifts;
  });

  function refundBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      operationId: randomUUID(),
      registerShiftId: shifts[ORG_A],
      reason: 'Customer returned the item',
      ...overrides,
    };
  }

  function refundSale(email: string, saleId: string, body: Record<string, unknown>) {
    return request(app)
      .post(`/v1/sales/${saleId}/refunds`)
      .set('authorization', auth(email))
      .send(body);
  }

  async function currentShift() {
    const res = await request(app)
      .get('/v1/register-shifts/current')
      .query({ registerId: REGISTER_A })
      .set('authorization', auth('cashier-a@example.com'))
      .expect(200);
    return res.body.data;
  }

  it('requires authentication and the refunds:approve permission', async () => {
    const sale = await createSale('cashier-a@example.com', saleBody()).expect(201);
    await request(app)
      .post(`/v1/sales/${sale.body.data.id}/refunds`)
      .send(refundBody())
      .expect(401);
    await refundSale('viewer-a@example.com', sale.body.data.id, refundBody()).expect(403);
  });

  it('refunds a cash sale, returns stock and reduces expected shift cash', async () => {
    const beforeStock = Number(await stockOf());
    const beforeShift = await currentShift();
    const sale = await createSale(
      'cashier-a@example.com',
      saleBody({
        lines: [{ productId: PRODUCT_A, quantity: '2' }],
        payments: [{ method: 'cash', tenderedMinor: 2500 }],
      }),
    ).expect(201);
    const saleId = sale.body.data.id as string;
    expect(Number(await stockOf())).toBe(beforeStock - 2);

    const res = await refundSale('cashier-a@example.com', saleId, refundBody()).expect(201);
    const refund = res.body.data;

    expect(refund.saleId).toBe(saleId);
    expect(refund.registerShiftId).toBe(shifts[ORG_A]);
    expect(refund.refundNumber).toMatch(/^REF-\d{8}-[0-9A-F]{8}$/);
    expect(refund.amountMinor).toBe(2000);
    expect(refund.reason).toBe('Customer returned the item');
    expect(refund.lines).toHaveLength(1);
    expect(refund.lines[0]).toMatchObject({
      productId: PRODUCT_A,
      quantity: '2',
      lineTotalMinor: 2000,
    });

    expect(Number(await stockOf())).toBe(beforeStock);

    const afterShift = await currentShift();
    expect(afterShift.cashRefundsMinor).toBe(beforeShift.cashRefundsMinor + 2000);
    expect(afterShift.expectedCashMinor).toBe(beforeShift.expectedCashMinor);
  });

  it('returns the same refund for a repeated operation without double-returning stock', async () => {
    const beforeStock = Number(await stockOf());
    const sale = await createSale(
      'cashier-a@example.com',
      saleBody({
        lines: [{ productId: PRODUCT_A, quantity: '1' }],
        payments: [{ method: 'cash', tenderedMinor: 1000 }],
      }),
    ).expect(201);
    const saleId = sale.body.data.id as string;
    const body = refundBody();

    const first = await refundSale('cashier-a@example.com', saleId, body).expect(201);
    const second = await refundSale('cashier-a@example.com', saleId, body).expect(201);

    expect(second.body.data.id).toBe(first.body.data.id);
    expect(Number(await stockOf())).toBe(beforeStock);
  });

  it('rejects a second refund of the same sale', async () => {
    const sale = await createSale('cashier-a@example.com', saleBody()).expect(201);
    const saleId = sale.body.data.id as string;

    await refundSale('cashier-a@example.com', saleId, refundBody()).expect(201);
    await refundSale('cashier-a@example.com', saleId, refundBody()).expect(409);
  });

  it('does not refund a sale from another organization or a missing sale', async () => {
    const sale = await createSale('cashier-b@example.com', {
      operationId: randomUUID(),
      locationId: LOCATION_B,
      registerShiftId: shifts[ORG_B],
      lines: [{ productId: PRODUCT_B, quantity: '1' }],
      payments: [{ method: 'cash', tenderedMinor: 2000 }],
    }).expect(201);

    await refundSale('cashier-a@example.com', sale.body.data.id, refundBody()).expect(404);
    await refundSale('cashier-a@example.com', randomUUID(), refundBody()).expect(404);
  });
});

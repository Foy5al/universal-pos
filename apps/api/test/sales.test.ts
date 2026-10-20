import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  CASHIER_A,
  LOCATION_B,
  MISSING_PRODUCT,
  ORG_A,
  ORG_B,
  PRODUCT_A,
  PRODUCT_B,
  REGISTER_A,
  createSalesFixture,
  type SalesFixture,
} from './support/salesFixture';

describe('sales API', () => {
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

  it('requires authentication and the sales:create permission', async () => {
    await request(app).post('/v1/sales').send(saleBody()).expect(401);
    await createSale('viewer-a@example.com', saleBody()).expect(403);
  });

  it('records a cash sale, snapshots prices and issues stock atomically', async () => {
    const before = await stockOf();
    const res = await createSale('cashier-a@example.com', saleBody()).expect(201);
    const sale = res.body.data;

    expect(sale.status).toBe('completed');
    expect(sale.saleNumber).toMatch(/^INV-\d{8}-[0-9A-F]{8}$/);
    expect(sale.subtotalMinor).toBe(2000);
    expect(sale.totalMinor).toBe(2000);
    expect(sale.paidMinor).toBe(2500);
    expect(sale.changeMinor).toBe(500);
    expect(sale.lines[0]).toMatchObject({
      sku: 'SKU-A',
      name: 'Widget A',
      quantity: '2',
      unitPriceMinor: 1000,
      lineTotalMinor: 2000,
    });
    expect(sale.payments[0]).toMatchObject({ method: 'cash', amountMinor: 2500 });
    expect(sale.createdBy).toBe(CASHIER_A);
    expect(sale.registerShiftId).toBe(shifts[ORG_A]);

    const after = Number(await stockOf());
    expect(after).toBe(Number(before) - 2);

    const fetched = await request(app)
      .get(`/v1/sales/${sale.id}`)
      .set('authorization', auth('viewer-a@example.com'))
      .expect(200);
    expect(fetched.body.data.id).toBe(sale.id);
  });

  it('returns the same sale for a repeated operation and does not double-issue stock', async () => {
    const body = saleBody({
      lines: [{ productId: PRODUCT_A, quantity: '3' }],
      payments: [{ method: 'cash', tenderedMinor: 3000 }],
    });
    const before = Number(await stockOf());

    const first = await createSale('cashier-a@example.com', body).expect(201);
    const second = await createSale('cashier-a@example.com', body).expect(201);

    expect(second.body.data.id).toBe(first.body.data.id);
    expect(Number(await stockOf())).toBe(before - 3);
  });

  it('rejects insufficient stock without creating a sale', async () => {
    const before = await stockOf();
    await createSale(
      'cashier-a@example.com',
      saleBody({
        lines: [{ productId: PRODUCT_A, quantity: '1000' }],
        payments: [{ method: 'cash', tenderedMinor: 1_000_000 }],
      }),
    ).expect(409);
    expect(await stockOf()).toBe(before);
  });

  it('rejects underpayment and duplicate product lines', async () => {
    await createSale(
      'cashier-a@example.com',
      saleBody({
        payments: [{ method: 'cash', tenderedMinor: 1999 }],
      }),
    ).expect(422);

    await createSale(
      'cashier-a@example.com',
      saleBody({
        lines: [
          { productId: PRODUCT_A, quantity: '1' },
          { productId: PRODUCT_A, quantity: '1' },
        ],
      }),
    ).expect(422);
  });

  it('rejects products and locations from another organization', async () => {
    await createSale(
      'cashier-a@example.com',
      saleBody({
        lines: [{ productId: PRODUCT_B, quantity: '1' }],
      }),
    ).expect(404);

    await createSale(
      'cashier-a@example.com',
      saleBody({
        lines: [{ productId: MISSING_PRODUCT, quantity: '1' }],
      }),
    ).expect(404);

    await createSale(
      'cashier-a@example.com',
      saleBody({
        locationId: LOCATION_B,
      }),
    ).expect(404);
  });

  it('requires an open shift and the registers:manage permission', async () => {
    await request(app)
      .post('/v1/register-shifts')
      .set('authorization', auth('viewer-a@example.com'))
      .send({ registerId: REGISTER_A, openingFloatMinor: 0 })
      .expect(403);

    await request(app)
      .post('/v1/register-shifts')
      .set('authorization', auth('cashier-a@example.com'))
      .send({ registerId: REGISTER_A, openingFloatMinor: 0 })
      .expect(409);

    const missingShift = saleBody();
    delete missingShift.registerShiftId;
    await createSale('cashier-a@example.com', missingShift).expect(422);

    await createSale(
      'cashier-a@example.com',
      saleBody({ registerShiftId: randomUUID() }),
    ).expect(404);
  });

  it('reconciles cash in/out at close and blocks checkout on a closed shift', async () => {
    const shiftId = shifts[ORG_A];
    await request(app)
      .post(`/v1/register-shifts/${shiftId}/cash-movements`)
      .set('authorization', auth('cashier-a@example.com'))
      .send({ type: 'in', amountMinor: 10_000, reason: 'Float top-up' })
      .expect(201);
    await request(app)
      .post(`/v1/register-shifts/${shiftId}/cash-movements`)
      .set('authorization', auth('cashier-a@example.com'))
      .send({ type: 'out', amountMinor: 2_500, reason: 'Courier payout' })
      .expect(201);

    const current = await request(app)
      .get('/v1/register-shifts/current')
      .query({ registerId: REGISTER_A })
      .set('authorization', auth('cashier-a@example.com'))
      .expect(200);
    expect(current.body.data.cashInMinor).toBe(10_000);
    expect(current.body.data.cashOutMinor).toBe(2_500);

    const counted = current.body.data.expectedCashMinor as number;
    const closed = await request(app)
      .post(`/v1/register-shifts/${shiftId}/close`)
      .set('authorization', auth('cashier-a@example.com'))
      .send({ countedCashMinor: counted, notes: 'Counted by cashier' })
      .expect(200);
    expect(closed.body.data.status).toBe('closed');
    expect(closed.body.data.varianceMinor).toBe(0);
    expect(closed.body.data.expectedCashMinor).toBe(counted);

    await createSale('cashier-a@example.com', saleBody()).expect(409);

    const reopened = await request(app)
      .post('/v1/register-shifts')
      .set('authorization', auth('cashier-a@example.com'))
      .send({ registerId: REGISTER_A, openingFloatMinor: 5000 })
      .expect(201);
    shifts[ORG_A] = reopened.body.data.id as string;
    await createSale('cashier-a@example.com', saleBody()).expect(201);
  });

  it('scopes lists to the caller organization', async () => {
    await createSale('cashier-b@example.com', {
      operationId: randomUUID(),
      locationId: LOCATION_B,
      registerShiftId: shifts[ORG_B],
      lines: [{ productId: PRODUCT_B, quantity: '1' }],
      payments: [{ method: 'cash', tenderedMinor: 2000 }],
    }).expect(201);

    const res = await request(app)
      .get('/v1/sales')
      .set('authorization', auth('cashier-a@example.com'))
      .expect(200);

    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(
      res.body.data.items.every(
        (sale: { organizationId: string }) => sale.organizationId === ORG_A,
      ),
    ).toBe(true);
  });
});


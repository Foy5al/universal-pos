import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  PRODUCT_A,
  REGISTER_A,
  createSalesFixture,
  type SalesFixture,
} from './support/salesFixture';

describe('reports API', () => {
  let app: SalesFixture['app'];
  let auth: SalesFixture['auth'];
  let saleBody: SalesFixture['saleBody'];
  let createSale: SalesFixture['createSale'];
  let shifts: SalesFixture['shifts'];

  beforeAll(async () => {
    const fixture = await createSalesFixture();
    app = fixture.app;
    auth = fixture.auth;
    saleBody = fixture.saleBody;
    createSale = fixture.createSale;
    shifts = fixture.shifts;
  });

  function summary(query = '') {
    return request(app)
      .get(`/v1/reports/sales-summary${query}`)
      .set('authorization', auth('cashier-a@example.com'));
  }

  function activity(query = '') {
    return request(app)
      .get(`/v1/reports/store-activity${query}`)
      .set('authorization', auth('cashier-a@example.com'));
  }

  it('requires authentication and reports:read', async () => {
    await request(app).get('/v1/reports/sales-summary').expect(401);
    await request(app)
      .get('/v1/reports/sales-summary')
      .set('authorization', auth('viewer-a@example.com'))
      .expect(403);
    await request(app).get('/v1/reports/store-activity').expect(401);
    await request(app)
      .get('/v1/reports/store-activity')
      .set('authorization', auth('viewer-a@example.com'))
      .expect(403);
  });

  it('summarizes gross, refunds, net and daily rows for the range', async () => {
    const sale = await createSale(
      'cashier-a@example.com',
      saleBody({
        lines: [{ productId: PRODUCT_A, quantity: '2' }],
        payments: [{ method: 'cash', tenderedMinor: 2500 }],
      }),
    ).expect(201);
    await request(app)
      .post(`/v1/sales/${sale.body.data.id}/refunds`)
      .set('authorization', auth('cashier-a@example.com'))
      .send({
        operationId: randomUUID(),
        registerShiftId: shifts[ORG_A],
        reason: 'Report refund',
      })
      .expect(201);

    const res = await summary('?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.000Z');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.grossSalesMinor).toBe(2000);
    expect(data.refundsMinor).toBe(2000);
    expect(data.netSalesMinor).toBe(0);
    expect(data.saleCount).toBe(1);
    expect(data.refundCount).toBe(1);
    expect(data.unitsSold).toBe('2');
    expect(data.days).toHaveLength(1);
    expect(data.days[0]).toMatchObject({
      saleCount: 1,
      refundCount: 1,
      grossSalesMinor: 2000,
      refundsMinor: 2000,
      netSalesMinor: 0,
      unitsSold: '2',
    });

    const scoped = await summary(
      `?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.000Z&locationId=${LOCATION_A}`,
    );
    expect(scoped.body.data.grossSalesMinor).toBe(2000);
  });

  it('combines sales, stock losses and receiving for the range', async () => {
    await request(app)
      .post('/v1/inventory/losses')
      .set('authorization', auth('cashier-a@example.com'))
      .send({
        locationId: LOCATION_A,
        productId: PRODUCT_A,
        quantity: '1',
        reason: 'damaged',
        note: 'Report damage',
      })
      .expect(201);

    const query = '?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.000Z';
    const res = await activity(query).expect(200);
    expect(res.body.data).toMatchObject({
      locationId: null,
      sales: {
        saleCount: 1,
        refundCount: 1,
        grossSalesMinor: 2000,
        refundsMinor: 2000,
        netSalesMinor: 0,
        unitsSold: '2',
      },
      losses: {
        count: 1,
        units: '1',
        costValueMinor: 500,
        missingCostCount: 0,
      },
      receiving: {
        count: 0,
        units: '0',
        costValueMinor: 0,
        missingCostCount: 0,
      },
    });

    const scoped = await request(app)
      .get(`/v1/reports/store-activity${query}`)
      .set('authorization', auth('scoped-a@example.com'))
      .expect(200);
    expect(scoped.body.data.losses.count).toBe(0);
    expect(scoped.body.data.sales.grossSalesMinor).toBe(0);

    await request(app)
      .get(`/v1/reports/store-activity${query}&locationId=${LOCATION_A}`)
      .set('authorization', auth('scoped-a@example.com'))
      .expect(404);
  });

  it('rejects an inverted or excessive range', async () => {
    await summary('?from=2026-12-31T00:00:00.000Z&to=2026-01-01T00:00:00.000Z').expect(422);
    await summary('?from=2026-01-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z').expect(200);
    await summary('?from=2020-01-01T00:00:00.000Z&to=2024-01-01T00:00:00.000Z').expect(422);
  });

  it('enforces store scope and tenant-owned locations', async () => {
    const query = '?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.000Z';
    const scoped = await request(app)
      .get(`/v1/reports/sales-summary${query}`)
      .set('authorization', auth('scoped-a@example.com'))
      .expect(200);
    expect(scoped.body.data.saleCount).toBe(0);
    expect(scoped.body.data.grossSalesMinor).toBe(0);

    await request(app)
      .get(`/v1/reports/sales-summary${query}&locationId=${LOCATION_A}`)
      .set('authorization', auth('scoped-a@example.com'))
      .expect(404);
    await request(app)
      .get(`/v1/reports/sales-summary${query}&locationId=${LOCATION_B}`)
      .set('authorization', auth('cashier-a@example.com'))
      .expect(404);
    await request(app)
      .get(`/v1/reports/shifts/${shifts[ORG_A]}`)
      .set('authorization', auth('scoped-a@example.com'))
      .expect(404);
  });

  it('reports an X report for the open shift', async () => {
    const res = await request(app)
      .get(`/v1/reports/shifts/${shifts[ORG_A]}`)
      .set('authorization', auth('cashier-a@example.com'))
      .expect(200);
    expect(res.body.data.type).toBe('x');
    expect(res.body.data.shift.id).toBe(shifts[ORG_A]);
    expect(res.body.data.saleCount).toBe(1);
    expect(res.body.data.refundCount).toBe(1);
    expect(res.body.data.netSalesMinor).toBe(0);
  });

  it('hides another organization shift report', async () => {
    await request(app)
      .get(`/v1/reports/shifts/${shifts[ORG_A]}`)
      .set('authorization', auth('cashier-b@example.com'))
      .expect(404);
  });

  it('reports a Z report after the shift closes', async () => {
    const current = await request(app)
      .get('/v1/register-shifts/current')
      .query({ registerId: REGISTER_A })
      .set('authorization', auth('cashier-a@example.com'))
      .expect(200);
    await request(app)
      .post(`/v1/register-shifts/${shifts[ORG_A]}/close`)
      .set('authorization', auth('cashier-a@example.com'))
      .send({ countedCashMinor: current.body.data.expectedCashMinor })
      .expect(200);

    const res = await request(app)
      .get(`/v1/reports/shifts/${shifts[ORG_A]}`)
      .set('authorization', auth('cashier-a@example.com'))
      .expect(200);
    expect(res.body.data.type).toBe('z');
    expect(res.body.data.shift.status).toBe('closed');
    expect(res.body.data.shift.varianceMinor).toBe(0);
  });
});

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { resolveLowStockThreshold } from '../src/services/inventory/lowStock';
import {
  CLERK_A,
  createLowStockTestApp,
  EMPTY_SCOPE_CLERK_A,
  LOCATION_A1,
  LOCATION_A2,
  MANAGER_A,
  MANAGER_B,
  ORG_A,
  PRODUCT_A,
  PRODUCT_C,
  SCOPED_CLERK_A,
  type LowStockTestApp,
} from './support/lowStockFixture';

describe('resolveLowStockThreshold', () => {
  it('prefers the product threshold over the global fallback', () => {
    expect(resolveLowStockThreshold(5n, 10n)).toEqual({ threshold: 5n, source: 'product' });
  });

  it('falls back to the global threshold when the product has none', () => {
    expect(resolveLowStockThreshold(null, 10n)).toEqual({ threshold: 10n, source: 'global' });
  });

  it('returns no rule when neither threshold is configured', () => {
    expect(resolveLowStockThreshold(null, null)).toBeNull();
  });
});

describe('low stock settings and alerts', () => {
  let app: LowStockTestApp['app'];
  let auth: LowStockTestApp['auth'];

  beforeAll(async () => {
    ({ app, auth } = await createLowStockTestApp());
  });

  function adjust(locationId: string, quantityDelta: string, productId = PRODUCT_A) {
    return request(app)
      .post('/v1/inventory/adjustments')
      .set('authorization', auth(MANAGER_A))
      .send({ locationId, productId, quantityDelta, reason: 'test' });
  }

  function saveSettings(email: string, globalThreshold: string | null) {
    return request(app)
      .put('/v1/inventory/low-stock/settings')
      .set('authorization', auth(email))
      .send({ globalThreshold });
  }

  it('requires authentication to read alerts', async () => {
    await request(app).get('/v1/inventory/low-stock').expect(401);
  });

  it('returns empty settings and no alerts before any rule is configured', async () => {
    const settings = await request(app)
      .get('/v1/inventory/low-stock/settings')
      .set('authorization', auth(CLERK_A))
      .expect(200);
    expect(settings.body.data).toEqual({
      organizationId: ORG_A,
      globalThreshold: null,
      updatedAt: null,
    });

    const overview = await request(app)
      .get('/v1/inventory/low-stock')
      .set('authorization', auth(CLERK_A))
      .expect(200);
    expect(overview.body.data).toEqual({
      locationId: null,
      globalThreshold: null,
      items: [],
      productThresholds: [],
    });
  });

  it('allows only managers to set the global threshold', async () => {
    await saveSettings('clerk-a@example.com', '10').expect(403);

    const saved = await saveSettings('manager-a@example.com', '10').expect(200);
    expect(saved.body.data).toMatchObject({ organizationId: ORG_A, globalThreshold: '10' });

    const settings = await request(app)
      .get('/v1/inventory/low-stock/settings')
      .set('authorization', auth(CLERK_A))
      .expect(200);
    expect(settings.body.data.globalThreshold).toBe('10');
  });

  it('aggregates on-hand by location and uses the global rule as fallback', async () => {
    await adjust(LOCATION_A1, '7').expect(201);
    await adjust(LOCATION_A2, '20').expect(201);

    const front = await request(app)
      .get(`/v1/inventory/low-stock?locationId=${LOCATION_A1}`)
      .set('authorization', auth(CLERK_A))
      .expect(200);
    expect(front.body.data.items).toContainEqual({
      productId: PRODUCT_A,
      name: 'Widget A',
      sku: 'SKU-A',
      onHand: '7',
      threshold: '10',
      source: 'global',
    });

    const back = await request(app)
      .get(`/v1/inventory/low-stock?locationId=${LOCATION_A2}`)
      .set('authorization', auth(CLERK_A))
      .expect(200);
    expect(
      back.body.data.items.some((item: { productId: string }) => item.productId === PRODUCT_A),
    ).toBe(false);

    const combined = await request(app)
      .get('/v1/inventory/low-stock')
      .set('authorization', auth(CLERK_A))
      .expect(200);
    expect(
      combined.body.data.items.some((item: { productId: string }) => item.productId === PRODUCT_A),
    ).toBe(false);
  });

  it('limits a store-scoped principal to its own locations', async () => {
    const own = await request(app)
      .get('/v1/inventory/low-stock')
      .set('authorization', auth(SCOPED_CLERK_A))
      .expect(200);
    expect(own.body.data.items).toContainEqual(
      expect.objectContaining({ productId: PRODUCT_A, onHand: '7', source: 'global' }),
    );

    await request(app)
      .get(`/v1/inventory/low-stock?locationId=${LOCATION_A2}`)
      .set('authorization', auth(SCOPED_CLERK_A))
      .expect(404);

    await request(app)
      .get(`/v1/inventory/low-stock?locationId=${LOCATION_A1}`)
      .set('authorization', auth(SCOPED_CLERK_A))
      .expect(200);

    // A scope with no locations must not report every product as zero stock.
    const emptyScope = await request(app)
      .get('/v1/inventory/low-stock')
      .set('authorization', auth(EMPTY_SCOPE_CLERK_A))
      .expect(200);
    expect(emptyScope.body.data.items).toEqual([]);
  });

  it('rejects negative settings and unknown locations', async () => {
    await saveSettings(MANAGER_A, '-1').expect(422);
    await request(app)
      .get('/v1/inventory/low-stock?locationId=00000000-0000-4000-8000-0000000000ff')
      .set('authorization', auth(CLERK_A))
      .expect(404);
  });

  it('keeps settings and alerts inside the organization', async () => {
    const otherSettings = await request(app)
      .get('/v1/inventory/low-stock/settings')
      .set('authorization', auth(MANAGER_B))
      .expect(200);
    expect(otherSettings.body.data.globalThreshold).toBeNull();

    const otherOverview = await request(app)
      .get('/v1/inventory/low-stock')
      .set('authorization', auth(MANAGER_B))
      .expect(200);
    const ids = otherOverview.body.data.items.map((item: { productId: string }) => item.productId);
    expect(ids).not.toContain(PRODUCT_A);
    expect(ids).not.toContain(PRODUCT_C);
  });
});

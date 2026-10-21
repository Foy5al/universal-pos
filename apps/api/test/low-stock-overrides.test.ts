import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  CLERK_A,
  createLowStockTestApp,
  LOCATION_A1,
  MANAGER_A,
  MANAGER_B,
  PRODUCT_A,
  type LowStockTestApp,
} from './support/lowStockFixture';

describe('product low stock overrides', () => {
  let app: LowStockTestApp['app'];
  let auth: LowStockTestApp['auth'];

  beforeAll(async () => {
    ({ app, auth } = await createLowStockTestApp());
    await request(app)
      .put('/v1/inventory/low-stock/settings')
      .set('authorization', auth(MANAGER_A))
      .send({ globalThreshold: '10' })
      .expect(200);
    await request(app)
      .post('/v1/inventory/adjustments')
      .set('authorization', auth(MANAGER_A))
      .send({ locationId: LOCATION_A1, productId: PRODUCT_A, quantityDelta: '7', reason: 'test' })
      .expect(201);
  });

  function saveProductThreshold(email: string, productId: string, threshold: string | null) {
    return request(app)
      .put(`/v1/inventory/low-stock/products/${productId}`)
      .set('authorization', auth(email))
      .send({ threshold });
  }

  function readFrontCounter() {
    return request(app)
      .get(`/v1/inventory/low-stock?locationId=${LOCATION_A1}`)
      .set('authorization', auth(CLERK_A))
      .expect(200);
  }

  it('lets a product threshold win over the global rule and restores the fallback on removal', async () => {
    const saved = await saveProductThreshold(MANAGER_A, PRODUCT_A, '5').expect(200);
    expect(saved.body.data).toEqual({ productId: PRODUCT_A, threshold: '5' });

    const healthy = await readFrontCounter();
    expect(
      healthy.body.data.items.some((item: { productId: string }) => item.productId === PRODUCT_A),
    ).toBe(false);
    expect(healthy.body.data.productThresholds).toEqual([{ productId: PRODUCT_A, threshold: '5' }]);

    await request(app)
      .post('/v1/inventory/adjustments')
      .set('authorization', auth(MANAGER_A))
      .send({ locationId: LOCATION_A1, productId: PRODUCT_A, quantityDelta: '-3', reason: 'test' })
      .expect(201);

    const alerting = await readFrontCounter();
    expect(alerting.body.data.items).toContainEqual({
      productId: PRODUCT_A,
      name: 'Widget A',
      sku: 'SKU-A',
      onHand: '4',
      threshold: '5',
      source: 'product',
    });

    await saveProductThreshold(MANAGER_A, PRODUCT_A, null).expect(200);

    const fallback = await readFrontCounter();
    expect(fallback.body.data.items).toContainEqual(
      expect.objectContaining({ productId: PRODUCT_A, threshold: '10', source: 'global' }),
    );
    expect(fallback.body.data.productThresholds).toEqual([]);
  });

  it('denies overrides to a read-only clerk', async () => {
    await saveProductThreshold(CLERK_A, PRODUCT_A, '2').expect(403);
  });

  it('rejects invalid thresholds and products from another organization', async () => {
    await saveProductThreshold(MANAGER_A, PRODUCT_A, '-5').expect(422);
    await saveProductThreshold(MANAGER_A, PRODUCT_A, '1.23456').expect(422);
    await saveProductThreshold(MANAGER_A, '00000000-0000-4000-8000-0000000000ff', '2').expect(404);
    await saveProductThreshold(MANAGER_B, PRODUCT_A, '2').expect(404);
  });
});

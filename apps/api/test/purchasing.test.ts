import type { Principal } from '@pos/contracts';
import type { CatalogSeed, InventorySeed, OrganizationRef, UserRecord } from '@pos/db';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { Argon2PasswordHasher } from '../src/core/passwordHasher';
import { createMemoryDeps } from '../src/deps';

const PASSWORD = 'password123';

const ORG_A = '00000000-0000-4000-8000-000000000001';
const ORG_B = '00000000-0000-4000-8000-000000000002';

const MANAGER_A = '00000000-0000-4000-8000-0000000000a1';
const CLERK_A = '00000000-0000-4000-8000-0000000000a2';
const SCOPED_A = '00000000-0000-4000-8000-0000000000a3';
const MANAGER_B = '00000000-0000-4000-8000-0000000000b1';

const PRODUCT_A = '00000000-0000-4000-8000-0000000000f1';
const PRODUCT_B = '00000000-0000-4000-8000-0000000000f2';
const LOCATION_A = '00000000-0000-4000-8000-0000000000e1';
const LOCATION_SCOPED_A = '00000000-0000-4000-8000-0000000000e2';
const LOCATION_SCOPED_B = '00000000-0000-4000-8000-0000000000e3';
const STORE_A = '00000000-0000-4000-8000-0000000000c1';
const STORE_B = '00000000-0000-4000-8000-0000000000c2';

const createdAt = '2026-10-17T00:00:00.000Z';

const catalog: CatalogSeed = {
  products: [
    {
      id: PRODUCT_A,
      organizationId: ORG_A,
      sku: 'SKU-A',
      name: 'Widget A',
      categoryId: null,
      brandId: null,
      unitId: null,
      barcode: null,
      priceMinor: 1000,
      costMinor: null,
      isActive: true,
      createdAt,
    },
    {
      id: PRODUCT_B,
      organizationId: ORG_B,
      sku: 'SKU-B',
      name: 'Widget B',
      categoryId: null,
      brandId: null,
      unitId: null,
      barcode: null,
      priceMinor: 1000,
      costMinor: null,
      isActive: true,
      createdAt,
    },
  ],
};

const inventory: InventorySeed = {
  locations: [
    {
      id: LOCATION_A,
      organizationId: ORG_A,
      storeId: null,
      name: 'Main Store',
      isActive: true,
      createdAt,
    },
    {
      id: LOCATION_SCOPED_A,
      organizationId: ORG_A,
      storeId: STORE_A,
      name: 'Store A stock',
      isActive: true,
      createdAt,
    },
    {
      id: LOCATION_SCOPED_B,
      organizationId: ORG_A,
      storeId: STORE_B,
      name: 'Store B stock',
      isActive: true,
      createdAt,
    },
  ],
};

const principals: Principal[] = [
  {
    userId: MANAGER_A,
    email: 'manager-a@example.com',
    displayName: 'Manager A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['purchases:read', 'purchases:manage', 'inventory:read'],
  },
  {
    userId: CLERK_A,
    email: 'clerk-a@example.com',
    displayName: 'Clerk A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['purchases:read'],
  },
  {
    userId: SCOPED_A,
    email: 'scoped-a@example.com',
    displayName: 'Scoped A',
    organizationId: ORG_A,
    storeIds: [STORE_A],
    permissions: ['purchases:read', 'purchases:manage', 'inventory:read'],
  },
  {
    userId: MANAGER_B,
    email: 'manager-b@example.com',
    displayName: 'Manager B',
    organizationId: ORG_B,
    storeIds: [],
    permissions: ['purchases:read', 'purchases:manage'],
  },
];

const organizations: OrganizationRef[] = [
  { id: ORG_A, slug: 'org-a' },
  { id: ORG_B, slug: 'org-b' },
];

describe('purchasing API', () => {
  let app: ReturnType<typeof createApp>;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    const users: UserRecord[] = principals.map((principal) => ({
      id: principal.userId,
      email: principal.email,
      passwordHash,
      displayName: principal.displayName,
      isActive: true,
    }));

    app = createApp(
      createMemoryDeps({
        users,
        principals,
        catalog,
        inventory,
        organizations,
        memberships: principals.map((principal) => ({
          userId: principal.userId,
          organizationId: principal.organizationId,
        })),
      }),
    );

    for (const principal of principals) {
      const res = await request(app)
        .post('/v1/auth/login')
        .send({ email: principal.email, password: PASSWORD })
        .expect(200);
      tokens[principal.email] = res.body.data.token as string;
    }
  });

  const auth = (email: string) => `Bearer ${tokens[email]}`;

  async function createSupplier(name: string): Promise<string> {
    const res = await request(app)
      .post('/v1/purchases/suppliers')
      .set('authorization', auth('manager-a@example.com'))
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  function createOrder(supplierId: string, quantity = '10') {
    return request(app)
      .post('/v1/purchases/orders')
      .set('authorization', auth('manager-a@example.com'))
      .send({
        supplierId,
        locationId: LOCATION_A,
        lines: [{ productId: PRODUCT_A, quantity, unitCostMinor: 1000 }],
      });
  }

  it('requires authentication', async () => {
    await request(app).get('/v1/purchases/orders').expect(401);
  });

  it('creates suppliers and rejects a duplicate name', async () => {
    await createSupplier('Acme Supplies');
    await request(app)
      .post('/v1/purchases/suppliers')
      .set('authorization', auth('manager-a@example.com'))
      .send({ name: 'Acme Supplies' })
      .expect(409);
  });

  it('denies supplier creation to a read-only clerk', async () => {
    await request(app)
      .post('/v1/purchases/suppliers')
      .set('authorization', auth('clerk-a@example.com'))
      .send({ name: 'Blocked' })
      .expect(403);
  });

  it('creates a draft purchase order with computed totals', async () => {
    const supplierId = await createSupplier('Beta Traders');
    const res = await createOrder(supplierId).expect(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.totalMinor).toBe(10000);
    expect(res.body.data.lines[0]).toMatchObject({
      productId: PRODUCT_A,
      quantity: '10',
      receivedQuantity: '0',
      unitCostMinor: 1000,
      lineTotalMinor: 10000,
    });
  });

  it('computes fractional line totals exactly', async () => {
    const supplierId = await createSupplier('Fractional');
    const res = await createOrder(supplierId, '1.5').expect(201);
    expect(res.body.data.lines[0].lineTotalMinor).toBe(1500);
    expect(res.body.data.totalMinor).toBe(1500);
  });

  it('rejects a non-positive order quantity', async () => {
    const supplierId = await createSupplier('Zero');
    await createOrder(supplierId, '0').expect(422);
  });

  it('rejects a product that is not in the organization', async () => {
    const supplierId = await createSupplier('Gamma');
    await request(app)
      .post('/v1/purchases/orders')
      .set('authorization', auth('manager-a@example.com'))
      .send({
        supplierId,
        locationId: LOCATION_A,
        lines: [{ productId: PRODUCT_B, quantity: '1', unitCostMinor: 100 }],
      })
      .expect(404);
  });

  it('advances status and receives stock against the ledger', async () => {
    const supplierId = await createSupplier('Delta');
    const created = await createOrder(supplierId).expect(201);
    const orderId = created.body.data.id as string;
    const lineId = created.body.data.lines[0].id as string;

    await request(app)
      .patch(`/v1/purchases/orders/${orderId}/status`)
      .set('authorization', auth('manager-a@example.com'))
      .send({ status: 'ordered' })
      .expect(200);

    const partial = await request(app)
      .post(`/v1/purchases/orders/${orderId}/receipts`)
      .set('authorization', auth('manager-a@example.com'))
      .send({ lines: [{ purchaseOrderLineId: lineId, quantity: '4' }] })
      .expect(201);
    expect(partial.body.data.purchaseOrder.status).toBe('partially_received');
    expect(partial.body.data.receipt).toMatchObject({ locationId: LOCATION_A });

    const balances = await request(app)
      .get(`/v1/inventory/balances?locationId=${LOCATION_A}&productId=${PRODUCT_A}`)
      .set('authorization', auth('manager-a@example.com'))
      .expect(200);
    expect(balances.body.data.items[0].quantity).toBe('4');

    const complete = await request(app)
      .post(`/v1/purchases/orders/${orderId}/receipts`)
      .set('authorization', auth('manager-a@example.com'))
      .send({ lines: [{ purchaseOrderLineId: lineId, quantity: '6' }] })
      .expect(201);
    expect(complete.body.data.purchaseOrder.status).toBe('received');

    // A fully received order cannot accept more stock.
    await request(app)
      .post(`/v1/purchases/orders/${orderId}/receipts`)
      .set('authorization', auth('manager-a@example.com'))
      .send({ lines: [{ purchaseOrderLineId: lineId, quantity: '1' }] })
      .expect(409);
  });

  it('rejects receiving beyond the outstanding quantity', async () => {
    const supplierId = await createSupplier('Epsilon');
    const created = await createOrder(supplierId, '5').expect(201);
    const orderId = created.body.data.id as string;
    const lineId = created.body.data.lines[0].id as string;

    await request(app)
      .patch(`/v1/purchases/orders/${orderId}/status`)
      .set('authorization', auth('manager-a@example.com'))
      .send({ status: 'ordered' })
      .expect(200);

    await request(app)
      .post(`/v1/purchases/orders/${orderId}/receipts`)
      .set('authorization', auth('manager-a@example.com'))
      .send({ lines: [{ purchaseOrderLineId: lineId, quantity: '6' }] })
      .expect(409);
  });

  it('limits purchase orders to the stores in the principal scope', async () => {
    const supplierId = await createSupplier('Scoped Supply');
    const otherStore = await request(app)
      .post('/v1/purchases/orders')
      .set('authorization', auth('manager-a@example.com'))
      .send({
        supplierId,
        locationId: LOCATION_SCOPED_B,
        lines: [{ productId: PRODUCT_A, quantity: '1', unitCostMinor: 1000 }],
      })
      .expect(201);

    await request(app)
      .patch(`/v1/purchases/orders/${otherStore.body.data.id as string}/status`)
      .set('authorization', auth('manager-a@example.com'))
      .send({ status: 'ordered' })
      .expect(200);

    const before = await request(app)
      .get('/v1/purchases/orders')
      .set('authorization', auth('scoped-a@example.com'))
      .expect(200);
    expect(before.body.data.total).toBe(0);

    const allowed = await request(app)
      .post('/v1/purchases/orders')
      .set('authorization', auth('scoped-a@example.com'))
      .send({
        supplierId,
        locationId: LOCATION_SCOPED_A,
        lines: [{ productId: PRODUCT_A, quantity: '1', unitCostMinor: 1000 }],
      })
      .expect(201);

    const after = await request(app)
      .get('/v1/purchases/orders')
      .set('authorization', auth('scoped-a@example.com'))
      .expect(200);
    expect(after.body.data.items.map((order: { id: string }) => order.id)).toEqual([
      allowed.body.data.id,
    ]);

    await request(app)
      .get(`/v1/purchases/orders/${otherStore.body.data.id as string}`)
      .set('authorization', auth('scoped-a@example.com'))
      .expect(404);

    await request(app)
      .post('/v1/purchases/orders')
      .set('authorization', auth('scoped-a@example.com'))
      .send({
        supplierId,
        locationId: LOCATION_SCOPED_B,
        lines: [{ productId: PRODUCT_A, quantity: '1', unitCostMinor: 1000 }],
      })
      .expect(404);

    await request(app)
      .post(`/v1/purchases/orders/${otherStore.body.data.id as string}/receipts`)
      .set('authorization', auth('scoped-a@example.com'))
      .send({
        lines: [
          {
            purchaseOrderLineId: otherStore.body.data.lines[0].id as string,
            quantity: '1',
          },
        ],
      })
      .expect(404);
  });

  it('scopes orders and suppliers to the caller organization', async () => {
    const ordersA = await request(app)
      .get('/v1/purchases/orders')
      .set('authorization', auth('manager-a@example.com'))
      .expect(200);
    const ordersB = await request(app)
      .get('/v1/purchases/orders')
      .set('authorization', auth('manager-b@example.com'))
      .expect(200);
    expect(ordersA.body.data.total).toBeGreaterThan(0);
    expect(ordersB.body.data.total).toBe(0);

    const suppliersB = await request(app)
      .get('/v1/purchases/suppliers')
      .set('authorization', auth('manager-b@example.com'))
      .expect(200);
    expect(suppliersB.body.data.items).toHaveLength(0);
  });
});

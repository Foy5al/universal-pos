import { randomUUID } from 'node:crypto';

import type { Principal } from '@pos/contracts';
import type { CatalogSeed, InventorySeed, OrganizationRef, UserRecord } from '@pos/db';
import request from 'supertest';

import { createApp } from '../../src/app';
import { Argon2PasswordHasher } from '../../src/core/passwordHasher';
import { createMemoryDeps } from '../../src/deps';

const PASSWORD = 'password123';

export const ORG_A = '00000000-0000-4000-8000-000000000001';
export const ORG_B = '00000000-0000-4000-8000-000000000002';

export const CASHIER_A = '00000000-0000-4000-8000-0000000000a1';
export const VIEWER_A = '00000000-0000-4000-8000-0000000000a2';
export const CASHIER_B = '00000000-0000-4000-8000-0000000000b1';
export const SCOPED_A = '00000000-0000-4000-8000-0000000000a3';
export const MANAGER_A = '00000000-0000-4000-8000-0000000000a4';

export const PRODUCT_A = '00000000-0000-4000-8000-0000000000f1';
export const PRODUCT_B = '00000000-0000-4000-8000-0000000000f2';
export const MISSING_PRODUCT = '00000000-0000-4000-8000-0000000000f9';
export const LOCATION_A = '00000000-0000-4000-8000-0000000000e1';
export const LOCATION_B = '00000000-0000-4000-8000-0000000000e2';
export const LOCATION_C = '00000000-0000-4000-8000-0000000000e3';
export const STORE_A = '00000000-0000-4000-8000-0000000000d1';
export const STORE_B = '00000000-0000-4000-8000-0000000000d2';
export const STORE_C = '00000000-0000-4000-8000-0000000000d3';
export const REGISTER_A = '00000000-0000-4000-8000-0000000000c1';
export const REGISTER_B = '00000000-0000-4000-8000-0000000000c2';

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
      costMinor: 500,
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
      priceMinor: 2000,
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
      storeId: STORE_A,
      name: 'Main Store',
      isActive: true,
      createdAt,
    },
    {
      id: LOCATION_B,
      organizationId: ORG_B,
      storeId: STORE_B,
      name: 'B Store',
      isActive: true,
      createdAt,
    },
    {
      id: LOCATION_C,
      organizationId: ORG_A,
      storeId: STORE_C,
      name: 'Quiet Store',
      isActive: true,
      createdAt,
    },
  ],
};

const cashierPermissions = [
  'sales:read',
  'sales:create',
  'sync:push',
  'sync:pull',
  'devices:read',
  'refunds:read',
  'refunds:approve',
  'registers:read',
  'registers:manage',
  'inventory:read',
  'inventory:adjust',
  'reports:read',
] as const;

const principals: Principal[] = [
  {
    userId: CASHIER_A,
    email: 'cashier-a@example.com',
    displayName: 'Cashier A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: [...cashierPermissions],
  },
  {
    userId: VIEWER_A,
    email: 'viewer-a@example.com',
    displayName: 'Viewer A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['sales:read'],
  },
  {
    userId: CASHIER_B,
    email: 'cashier-b@example.com',
    displayName: 'Cashier B',
    organizationId: ORG_B,
    storeIds: [],
    permissions: [...cashierPermissions],
  },
  {
    userId: SCOPED_A,
    email: 'scoped-a@example.com',
    displayName: 'Scoped A',
    organizationId: ORG_A,
    storeIds: [STORE_C],
    permissions: ['sales:read', 'reports:read'],
  },
  {
    userId: MANAGER_A,
    email: 'manager-a@example.com',
    displayName: 'Manager A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: [
      'sales:read',
      'sync:push',
      'sync:pull',
      'sync:review',
      'devices:read',
      'devices:manage',
    ],
  },
];

const organizations: OrganizationRef[] = [
  { id: ORG_A, slug: 'org-a' },
  { id: ORG_B, slug: 'org-b' },
];

export interface SalesFixture {
  app: ReturnType<typeof createApp>;
  tokens: Record<string, string>;
  shifts: Record<string, string>;
  auth(email: string): string;
  saleBody(overrides?: Record<string, unknown>): Record<string, unknown>;
  createSale(email: string, body: Record<string, unknown>): request.Test;
  stockOf(productId?: string): Promise<string>;
}

export async function createSalesFixture(): Promise<SalesFixture> {
  const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
  const users: UserRecord[] = principals.map((principal) => ({
    id: principal.userId,
    email: principal.email,
    passwordHash,
    displayName: principal.displayName,
    isActive: true,
  }));

  const app = createApp(
    createMemoryDeps({
      users,
      principals,
      catalog,
      inventory,
      registers: [
        { id: REGISTER_A, organizationId: ORG_A, storeId: STORE_A, name: 'Till A', code: 'A1' },
        { id: REGISTER_B, organizationId: ORG_B, storeId: STORE_B, name: 'Till B', code: 'B1' },
      ],
      organizations,
      memberships: principals.map((principal) => ({
        userId: principal.userId,
        organizationId: principal.organizationId,
      })),
    }),
  );

  const tokens: Record<string, string> = {};
  const shifts: Record<string, string> = {};
  const auth = (email: string) => `Bearer ${tokens[email]}`;

  for (const principal of principals) {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: principal.email, password: PASSWORD })
      .expect(200);
    tokens[principal.email] = res.body.data.token as string;
  }

  for (const [email, registerId, organizationId] of [
    ['cashier-a@example.com', REGISTER_A, ORG_A],
    ['cashier-b@example.com', REGISTER_B, ORG_B],
  ] as const) {
    const res = await request(app)
      .post('/v1/register-shifts')
      .set('authorization', auth(email))
      .send({ registerId, openingFloatMinor: 0 })
      .expect(201);
    shifts[organizationId] = res.body.data.id as string;
  }

  await request(app)
    .post('/v1/inventory/adjustments')
    .set('authorization', auth('cashier-a@example.com'))
    .send({ locationId: LOCATION_A, productId: PRODUCT_A, quantityDelta: '100', reason: 'seed' })
    .expect(201);

  await request(app)
    .post('/v1/inventory/adjustments')
    .set('authorization', auth('cashier-b@example.com'))
    .send({ locationId: LOCATION_B, productId: PRODUCT_B, quantityDelta: '10', reason: 'seed' })
    .expect(201);

  return {
    app,
    tokens,
    shifts,
    auth,
    saleBody(overrides = {}) {
      return {
        operationId: randomUUID(),
        locationId: LOCATION_A,
        registerShiftId: shifts[ORG_A],
        lines: [{ productId: PRODUCT_A, quantity: '2' }],
        payments: [{ method: 'cash', tenderedMinor: 2500 }],
        ...overrides,
      };
    },
    createSale(email, body) {
      return request(app).post('/v1/sales').set('authorization', auth(email)).send(body);
    },
    async stockOf(productId = PRODUCT_A) {
      const res = await request(app)
        .get('/v1/inventory/balances')
        .query({ productId, locationId: LOCATION_A })
        .set('authorization', auth('cashier-a@example.com'))
        .expect(200);
      return (res.body.data.items[0]?.quantity as string | undefined) ?? '0';
    },
  };
}

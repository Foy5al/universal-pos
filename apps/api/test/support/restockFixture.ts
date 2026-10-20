import type { Principal } from '@pos/contracts';
import type { CatalogSeed, InventorySeed, UserRecord } from '@pos/db';
import request from 'supertest';

import { createApp } from '../../src/app';
import { Argon2PasswordHasher } from '../../src/core/passwordHasher';
import { createMemoryDeps } from '../../src/deps';

const PASSWORD = 'password123';
export const ORG_A = '00000000-0000-4000-8000-000000000001';
export const ORG_B = '00000000-0000-4000-8000-000000000002';
export const CASHIER_A = '00000000-0000-4000-8000-0000000000a1';
export const VIEWER_A = '00000000-0000-4000-8000-0000000000a2';
export const MANAGER_A = '00000000-0000-4000-8000-0000000000a3';
export const SCOPED_A = '00000000-0000-4000-8000-0000000000a4';
export const MANAGER_B = '00000000-0000-4000-8000-0000000000b1';
export const CASHIER_B = '00000000-0000-4000-8000-0000000000b2';
export const PRODUCT_A = '00000000-0000-4000-8000-0000000000f1';
export const PRODUCT_A2 = '00000000-0000-4000-8000-0000000000f3';
export const PRODUCT_B = '00000000-0000-4000-8000-0000000000f2';
export const LOCATION_A = '00000000-0000-4000-8000-0000000000e1';
export const LOCATION_SCOPED_A = '00000000-0000-4000-8000-0000000000e2';
export const STORE_A = '00000000-0000-4000-8000-0000000000d1';
const createdAt = '2026-10-17T00:00:00.000Z';

const catalog: CatalogSeed = {
  products: [
    {
      id: PRODUCT_A,
      organizationId: ORG_A,
      sku: 'SKU-A',
      name: 'Empty shelf item',
      categoryId: null,
      brandId: null,
      unitId: null,
      barcode: null,
      priceMinor: 1000,
      costMinor: 600,
      isActive: true,
      createdAt,
    },
    {
      id: PRODUCT_A2,
      organizationId: ORG_A,
      sku: 'SKU-A2',
      name: 'Second empty shelf item',
      categoryId: null,
      brandId: null,
      unitId: null,
      barcode: null,
      priceMinor: 2000,
      costMinor: null,
      isActive: true,
      createdAt,
    },
    {
      id: PRODUCT_B,
      organizationId: ORG_B,
      sku: 'SKU-B',
      name: 'Other tenant item',
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
  ],
};

const principals: Principal[] = [
  {
    userId: CASHIER_A,
    email: 'cashier-a@example.com',
    displayName: 'Cashier A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['restock:request', 'inventory:read'],
  },
  {
    userId: VIEWER_A,
    email: 'viewer-a@example.com',
    displayName: 'Viewer A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['purchases:read'],
  },
  {
    userId: MANAGER_A,
    email: 'manager-a@example.com',
    displayName: 'Manager A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['purchases:read', 'purchases:manage', 'inventory:read', 'restock:request'],
  },
  {
    userId: SCOPED_A,
    email: 'scoped-a@example.com',
    displayName: 'Scoped Manager A',
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
    permissions: ['purchases:read', 'purchases:manage', 'restock:request'],
  },
  {
    userId: CASHIER_B,
    email: 'cashier-b@example.com',
    displayName: 'Cashier B',
    organizationId: ORG_B,
    storeIds: [],
    permissions: ['restock:request'],
  },
];

export interface RestockFixture {
  app: ReturnType<typeof createApp>;
  tokens: Record<string, string>;
  auth(email: string): string;
  createRequest(email: string, overrides?: Record<string, unknown>): request.Test;
  createSupplier(name: string): Promise<string>;
  pendingRequest(quantity?: string): Promise<string>;
}

export async function createRestockFixture(): Promise<RestockFixture> {
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
      organizations: [
        { id: ORG_A, slug: 'org-a' },
        { id: ORG_B, slug: 'org-b' },
      ],
      memberships: principals.map((principal) => ({
        userId: principal.userId,
        organizationId: principal.organizationId,
      })),
    }),
  );

  const tokens: Record<string, string> = {};
  for (const principal of principals) {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: principal.email, password: PASSWORD })
      .expect(200);
    tokens[principal.email] = res.body.data.token as string;
  }

  const auth = (email: string) => `Bearer ${tokens[email]}`;

  function createRequest(email: string, overrides: Record<string, unknown> = {}) {
    return request(app)
      .post('/v1/restock-requests')
      .set('authorization', auth(email))
      .send({
        locationId: LOCATION_A,
        productId: PRODUCT_A,
        quantity: '5',
        ...overrides,
      });
  }

  async function createSupplier(name: string): Promise<string> {
    const res = await request(app)
      .post('/v1/purchases/suppliers')
      .set('authorization', auth('manager-a@example.com'))
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  async function pendingRequest(quantity = '5'): Promise<string> {
    const res = await createRequest('cashier-a@example.com', { quantity }).expect(201);
    return res.body.data.id as string;
  }

  return { app, tokens, auth, createRequest, createSupplier, pendingRequest };
}

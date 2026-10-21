import type { Principal } from '@pos/contracts';
import type { CatalogSeed, InventorySeed, OrganizationRef, UserRecord } from '@pos/db';
import request from 'supertest';

import { createApp } from '../../src/app';
import { Argon2PasswordHasher } from '../../src/core/passwordHasher';
import { createMemoryDeps } from '../../src/deps';

const PASSWORD = 'password123';

export const ORG_A = '00000000-0000-4000-8000-000000000001';
export const ORG_B = '00000000-0000-4000-8000-000000000002';

export const MANAGER_A = '00000000-0000-4000-8000-0000000000a1';
export const CLERK_A = '00000000-0000-4000-8000-0000000000a2';
export const SCOPED_CLERK_A = '00000000-0000-4000-8000-0000000000a3';
export const EMPTY_SCOPE_CLERK_A = '00000000-0000-4000-8000-0000000000a4';
export const MANAGER_B = '00000000-0000-4000-8000-0000000000b1';

export const PRODUCT_A = '00000000-0000-4000-8000-0000000000f1';
export const PRODUCT_C = '00000000-0000-4000-8000-0000000000f3';
export const PRODUCT_B = '00000000-0000-4000-8000-0000000000f2';
export const LOCATION_A1 = '00000000-0000-4000-8000-0000000000e1';
export const LOCATION_A2 = '00000000-0000-4000-8000-0000000000e2';
export const LOCATION_B = '00000000-0000-4000-8000-0000000000e3';

const STORE_A = '00000000-0000-4000-8000-0000000000c1';
const STORE_B = '00000000-0000-4000-8000-0000000000c2';
const STORE_C = '00000000-0000-4000-8000-0000000000c3';

const createdAt = '2026-10-17T00:00:00.000Z';

function product(id: string, organizationId: string, sku: string, name: string) {
  return {
    id,
    organizationId,
    sku,
    name,
    categoryId: null,
    brandId: null,
    unitId: null,
    barcode: null,
    priceMinor: 1000,
    costMinor: null,
    isActive: true,
    createdAt,
  };
}

const catalog: CatalogSeed = {
  products: [
    product(PRODUCT_A, ORG_A, 'SKU-A', 'Widget A'),
    product(PRODUCT_C, ORG_A, 'SKU-C', 'Widget C'),
    product(PRODUCT_B, ORG_B, 'SKU-B', 'Widget B'),
  ],
};

function location(id: string, organizationId: string, name: string, storeId: string | null = null) {
  return { id, organizationId, storeId, name, isActive: true, createdAt };
}

const inventory: InventorySeed = {
  locations: [
    location(LOCATION_A1, ORG_A, 'Front Counter', STORE_A),
    location(LOCATION_A2, ORG_A, 'Back Store', STORE_B),
    location(LOCATION_B, ORG_B, 'B Store'),
  ],
};

const managerPermissions = [
  'inventory:read',
  'inventory:adjust',
  'inventory:manage',
  'catalog:read',
  'catalog:manage',
] as const;

const principals: Principal[] = [
  {
    userId: MANAGER_A,
    email: 'manager-a@example.com',
    displayName: 'Manager A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: [...managerPermissions],
  },
  {
    userId: CLERK_A,
    email: 'clerk-a@example.com',
    displayName: 'Clerk A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['inventory:read'],
  },
  {
    userId: SCOPED_CLERK_A,
    email: 'scoped-clerk-a@example.com',
    displayName: 'Scoped Clerk A',
    organizationId: ORG_A,
    storeIds: [STORE_A],
    permissions: ['inventory:read'],
  },
  {
    userId: EMPTY_SCOPE_CLERK_A,
    email: 'empty-scope-clerk-a@example.com',
    displayName: 'Empty Scope Clerk A',
    organizationId: ORG_A,
    storeIds: [STORE_C],
    permissions: ['inventory:read'],
  },
  {
    userId: MANAGER_B,
    email: 'manager-b@example.com',
    displayName: 'Manager B',
    organizationId: ORG_B,
    storeIds: [],
    permissions: [...managerPermissions],
  },
];

const organizations: OrganizationRef[] = [
  { id: ORG_A, slug: 'org-a' },
  { id: ORG_B, slug: 'org-b' },
];

export interface LowStockTestApp {
  app: ReturnType<typeof createApp>;
  auth: (email: string) => string;
}

export async function createLowStockTestApp(): Promise<LowStockTestApp> {
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
      organizations,
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
    tokens[principal.userId] = res.body.data.token as string;
  }

  return { app, auth: (email) => `Bearer ${tokens[email]}` };
}

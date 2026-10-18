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
const MANAGER_B = '00000000-0000-4000-8000-0000000000b1';

const PRODUCT_A = '00000000-0000-4000-8000-0000000000f1';
const PRODUCT_B = '00000000-0000-4000-8000-0000000000f2';
const LOCATION_A = '00000000-0000-4000-8000-0000000000e1';
const LOCATION_B = '00000000-0000-4000-8000-0000000000e2';

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
      id: LOCATION_B,
      organizationId: ORG_B,
      storeId: null,
      name: 'B Store',
      isActive: true,
      createdAt,
    },
  ],
};

const fullPermissions = ['inventory:read', 'inventory:adjust', 'inventory:manage'] as const;

const principals: Principal[] = [
  {
    userId: MANAGER_A,
    email: 'manager-a@example.com',
    displayName: 'Manager A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: [...fullPermissions],
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
    userId: MANAGER_B,
    email: 'manager-b@example.com',
    displayName: 'Manager B',
    organizationId: ORG_B,
    storeIds: [],
    permissions: [...fullPermissions],
  },
];

const organizations: OrganizationRef[] = [
  { id: ORG_A, slug: 'org-a' },
  { id: ORG_B, slug: 'org-b' },
];

describe('inventory API', () => {
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

  function adjust(email: string, quantityDelta: string, productId = PRODUCT_A) {
    return request(app)
      .post('/v1/inventory/adjustments')
      .set('authorization', auth(email))
      .send({ locationId: LOCATION_A, productId, quantityDelta, reason: 'test' });
  }

  it('requires authentication', async () => {
    await request(app).get('/v1/inventory/balances').expect(401);
  });

  it('denies adjustment to a read-only clerk', async () => {
    await adjust('clerk-a@example.com', '5').expect(403);
  });

  it('creates a stock location and rejects a duplicate name', async () => {
    await request(app)
      .post('/v1/inventory/locations')
      .set('authorization', auth('manager-a@example.com'))
      .send({ name: 'Warehouse A' })
      .expect(201);

    await request(app)
      .post('/v1/inventory/locations')
      .set('authorization', auth('manager-a@example.com'))
      .send({ name: 'Warehouse A' })
      .expect(409);
  });

  it('does not allow a clerk to create a location', async () => {
    await request(app)
      .post('/v1/inventory/locations')
      .set('authorization', auth('clerk-a@example.com'))
      .send({ name: 'Nope' })
      .expect(403);
  });

  it('records adjustments and keeps the balance consistent with the ledger', async () => {
    const received = await adjust('manager-a@example.com', '10').expect(201);
    expect(received.body.data.balance.quantity).toBe('10');
    expect(received.body.data.movement.balanceAfter).toBe('10');
    expect(received.body.data.movement.movementType).toBe('adjustment');

    const issued = await adjust('manager-a@example.com', '-3').expect(201);
    expect(issued.body.data.balance.quantity).toBe('7');

    const balances = await request(app)
      .get(`/v1/inventory/balances?locationId=${LOCATION_A}&productId=${PRODUCT_A}`)
      .set('authorization', auth('clerk-a@example.com'))
      .expect(200);
    expect(balances.body.data.items).toEqual([
      expect.objectContaining({ locationId: LOCATION_A, productId: PRODUCT_A, quantity: '7' }),
    ]);
  });

  it('handles fractional quantities exactly', async () => {
    const result = await adjust('manager-a@example.com', '1.5').expect(201);
    expect(result.body.data.balance.quantity).toBe('8.5');
  });

  it('rejects a zero delta', async () => {
    await adjust('manager-a@example.com', '0').expect(422);
  });

  it('rejects a product that is not visible to the organization', async () => {
    await adjust('manager-a@example.com', '1', PRODUCT_B).expect(404);
  });

  it('scopes balances and movements to the caller organization', async () => {
    const balancesB = await request(app)
      .get('/v1/inventory/balances')
      .set('authorization', auth('manager-b@example.com'))
      .expect(200);
    expect(balancesB.body.data.items).toHaveLength(0);

    const movementsA = await request(app)
      .get('/v1/inventory/movements')
      .set('authorization', auth('clerk-a@example.com'))
      .expect(200);
    expect(movementsA.body.data.total).toBeGreaterThanOrEqual(3);
    expect(
      movementsA.body.data.items.every(
        (movement: { organizationId: string }) => movement.organizationId === ORG_A,
      ),
    ).toBe(true);
  });
});

import type { Principal } from '@pos/contracts';
import type { CatalogSeed, OrganizationRef, UserRecord } from '@pos/db';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { Argon2PasswordHasher } from '../src/core/passwordHasher';
import { createMemoryDeps } from '../src/deps';

const PASSWORD = 'password123';

const ORG_A = '00000000-0000-4000-8000-0000000000a0';
const ORG_B = '00000000-0000-4000-8000-0000000000b0';

const OWNER_A = '00000000-0000-4000-8000-0000000000e1';
const VIEWER_A = '00000000-0000-4000-8000-0000000000e2';
const ANALYST_A = '00000000-0000-4000-8000-0000000000e3';
const OWNER_B = '00000000-0000-4000-8000-0000000000e4';

const CATEGORY_A = '00000000-0000-4000-8000-0000000000ca';
const CATEGORY_B = '00000000-0000-4000-8000-0000000000cb';
const BRAND_A = '00000000-0000-4000-8000-0000000000ba';
const UNIT_A = '00000000-0000-4000-8000-000000000001';

const createdAt = '2026-10-17T00:00:00.000Z';

const catalog: CatalogSeed = {
  categories: [
    {
      id: CATEGORY_A,
      organizationId: ORG_A,
      parentId: null,
      name: 'Beverages',
      isActive: true,
      createdAt,
    },
    {
      id: CATEGORY_B,
      organizationId: ORG_B,
      parentId: null,
      name: 'B-Only',
      isActive: true,
      createdAt,
    },
  ],
  brands: [{ id: BRAND_A, organizationId: ORG_A, name: 'Acme', isActive: true, createdAt }],
  units: [
    {
      id: UNIT_A,
      organizationId: ORG_A,
      name: 'Piece',
      abbreviation: 'pc',
      isActive: true,
      createdAt,
    },
  ],
};

const principals: Principal[] = [
  {
    userId: OWNER_A,
    email: 'owner-a@example.com',
    displayName: 'Owner A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['catalog:read', 'catalog:manage'],
  },
  {
    userId: VIEWER_A,
    email: 'viewer-a@example.com',
    displayName: 'Viewer A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['catalog:read'],
  },
  {
    userId: ANALYST_A,
    email: 'analyst-a@example.com',
    displayName: 'Analyst A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['reports:read'],
  },
  {
    userId: OWNER_B,
    email: 'owner-b@example.com',
    displayName: 'Owner B',
    organizationId: ORG_B,
    storeIds: [],
    permissions: ['catalog:read', 'catalog:manage'],
  },
];

const organizations: OrganizationRef[] = [
  { id: ORG_A, slug: 'org-a' },
  { id: ORG_B, slug: 'org-b' },
];

describe('catalog API', () => {
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

  it('requires authentication', async () => {
    await request(app).get('/v1/catalog/products').expect(401);
  });

  it('rejects a caller without a catalog permission', async () => {
    await request(app)
      .get('/v1/catalog/products')
      .set('authorization', auth('analyst-a@example.com'))
      .expect(403);
  });

  it('lists only the caller organization categories', async () => {
    const listed = await request(app)
      .get('/v1/catalog/categories')
      .set('authorization', auth('owner-b@example.com'))
      .expect(200);
    expect(listed.body.data.total).toBe(1);
    expect(listed.body.data.items.map((row: { id: string }) => row.id)).toContain(CATEGORY_B);
    expect(listed.body.data.items.map((row: { id: string }) => row.id)).not.toContain(CATEGORY_A);
  });

  it('creates and reads a category', async () => {
    const created = await request(app)
      .post('/v1/catalog/categories')
      .set('authorization', auth('owner-a@example.com'))
      .send({ name: 'Snacks' })
      .expect(201);
    expect(created.body.data.name).toBe('Snacks');

    const fetched = await request(app)
      .get(`/v1/catalog/categories/${created.body.data.id}`)
      .set('authorization', auth('owner-a@example.com'))
      .expect(200);
    expect(fetched.body.data.id).toBe(created.body.data.id);
  });

  it('rejects a write from a read-only caller', async () => {
    await request(app)
      .post('/v1/catalog/categories')
      .set('authorization', auth('viewer-a@example.com'))
      .send({ name: 'Nope' })
      .expect(403);
  });

  it('validates the request body', async () => {
    await request(app)
      .post('/v1/catalog/products')
      .set('authorization', auth('owner-a@example.com'))
      .send({ name: '', priceMinor: -5 })
      .expect(422);
  });

  it('rejects a malformed resource id', async () => {
    await request(app)
      .get('/v1/catalog/categories/not-a-uuid')
      .set('authorization', auth('owner-a@example.com'))
      .expect(422);
  });

  it('returns 404 for an unknown but well-formed id', async () => {
    await request(app)
      .get('/v1/catalog/categories/00000000-0000-4000-8000-00000000ffff')
      .set('authorization', auth('owner-a@example.com'))
      .expect(404);
  });

  it('creates a product with in-organization references', async () => {
    const created = await request(app)
      .post('/v1/catalog/products')
      .set('authorization', auth('owner-a@example.com'))
      .send({
        sku: 'SKU-100',
        name: 'Cola 500ml',
        priceMinor: 4000,
        categoryId: CATEGORY_A,
        brandId: BRAND_A,
        unitId: UNIT_A,
      })
      .expect(201);
    expect(created.body.data.priceMinor).toBe(4000);
    expect(created.body.data.categoryId).toBe(CATEGORY_A);
  });

  it('rejects a product referencing another organization category', async () => {
    await request(app)
      .post('/v1/catalog/products')
      .set('authorization', auth('owner-a@example.com'))
      .send({ sku: 'SKU-200', name: 'Foreign', priceMinor: 100, categoryId: CATEGORY_B })
      .expect(422);
  });

  it('rejects a duplicate SKU within the organization', async () => {
    await request(app)
      .post('/v1/catalog/products')
      .set('authorization', auth('owner-a@example.com'))
      .send({ sku: 'SKU-100', name: 'Cola duplicate', priceMinor: 4100 })
      .expect(409);
  });

  it('updates a product', async () => {
    const created = await request(app)
      .post('/v1/catalog/products')
      .set('authorization', auth('owner-a@example.com'))
      .send({ sku: 'SKU-300', name: 'Tea', priceMinor: 1500 })
      .expect(201);

    const updated = await request(app)
      .patch(`/v1/catalog/products/${created.body.data.id}`)
      .set('authorization', auth('owner-a@example.com'))
      .send({ priceMinor: 1750, isActive: false })
      .expect(200);
    expect(updated.body.data.priceMinor).toBe(1750);
    expect(updated.body.data.isActive).toBe(false);
  });
});

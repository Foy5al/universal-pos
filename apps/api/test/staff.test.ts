import type { Principal } from '@pos/contracts';
import type { OrganizationRef, StaffRecord, StoreRecord, UserRecord } from '@pos/db';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { Argon2PasswordHasher } from '../src/core/passwordHasher';
import { createMemoryDeps } from '../src/deps';

const PASSWORD = 'password123';
const ORG = '00000000-0000-4000-8000-0000000000f1';
const ORG_OTHER = '00000000-0000-4000-8000-0000000000f2';
const STORE_MAIN = '00000000-0000-4000-8000-0000000000e1';
const STORE_SECOND = '00000000-0000-4000-8000-0000000000e2';
const STORE_FOREIGN = '00000000-0000-4000-8000-0000000000e3';
const OWNER_ID = '00000000-0000-4000-8000-0000000000d1';
const CASHIER_ID = '00000000-0000-4000-8000-0000000000d2';
const SCOPED_MANAGER_ID = '00000000-0000-4000-8000-0000000000d3';

const organizations: OrganizationRef[] = [
  { id: ORG, slug: 'admin-org' },
  { id: ORG_OTHER, slug: 'other-org' },
];

const stores: StoreRecord[] = [
  { id: STORE_MAIN, organizationId: ORG, name: 'Main', timezone: 'Asia/Dhaka', isActive: true },
  {
    id: STORE_SECOND,
    organizationId: ORG,
    name: 'Second',
    timezone: 'Asia/Dhaka',
    isActive: true,
  },
  {
    id: STORE_FOREIGN,
    organizationId: ORG_OTHER,
    name: 'Foreign',
    timezone: 'Asia/Dhaka',
    isActive: true,
  },
];

const principals: Principal[] = [
  {
    userId: OWNER_ID,
    email: 'owner@admin.test',
    displayName: 'Owner',
    organizationId: ORG,
    storeIds: [],
    permissions: [
      'stores:read',
      'staff:read',
      'staff:manage',
      'registers:read',
      'registers:manage',
    ],
  },
  {
    userId: CASHIER_ID,
    email: 'cashier@admin.test',
    displayName: 'Cashier',
    organizationId: ORG,
    storeIds: [STORE_MAIN],
    permissions: ['stores:read', 'sales:create'],
  },
  {
    userId: SCOPED_MANAGER_ID,
    email: 'scoped@admin.test',
    displayName: 'Scoped Manager',
    organizationId: ORG,
    storeIds: [STORE_MAIN],
    permissions: ['stores:read', 'registers:read', 'registers:manage'],
  },
];

describe('staff and counter administration', () => {
  let app: ReturnType<typeof createApp>;
  let ownerToken: string;
  let cashierToken: string;
  let scopedManagerToken: string;

  beforeAll(async () => {
    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    const users: UserRecord[] = principals.map((principal) => ({
      id: principal.userId,
      email: principal.email,
      passwordHash,
      displayName: principal.displayName,
      isActive: true,
    }));
    const owner: StaffRecord = {
      userId: OWNER_ID,
      organizationId: ORG,
      email: 'owner@admin.test',
      displayName: 'Owner',
      isActive: true,
      roleName: 'Owner',
      storeId: null,
      rolePermissions: [
        'stores:read',
        'staff:read',
        'staff:manage',
        'registers:read',
        'registers:manage',
      ],
      overrides: [],
    };
    app = createApp(
      createMemoryDeps({
        users,
        principals,
        stores,
        organizations,
        staff: [owner],
        memberships: principals.map((principal) => ({
          userId: principal.userId,
          organizationId: ORG,
        })),
      }),
    );

    const login = async (email: string): Promise<string> => {
      const res = await request(app)
        .post('/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      return res.body.data.token as string;
    };
    ownerToken = await login('owner@admin.test');
    cashierToken = await login('cashier@admin.test');
    scopedManagerToken = await login('scoped@admin.test');
  });

  it('creates a manager account with the manager permission preset', async () => {
    const res = await request(app)
      .post('/v1/staff')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'manager@admin.test',
        displayName: 'Morning Manager',
        password: 'manager-pass-1',
        role: 'manager',
        storeId: STORE_MAIN,
      })
      .expect(201);

    expect(res.body.data.role).toBe('Manager');
    expect(res.body.data.storeId).toBe(STORE_MAIN);
    expect(res.body.data.permissions).toContain('reports:read');
    expect(res.body.data.permissions).not.toContain('staff:manage');
  });

  it('rejects a duplicate email and invalid role payloads', async () => {
    await request(app)
      .post('/v1/staff')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'MANAGER@admin.test',
        displayName: 'Duplicate',
        password: 'manager-pass-2',
        role: 'manager',
      })
      .expect(409);

    await request(app)
      .post('/v1/staff')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'bad-role@admin.test',
        displayName: 'Bad Role',
        password: 'manager-pass-3',
        role: 'superuser',
      })
      .expect(422);
  });

  it('denies staff creation to a caller without staff:manage', async () => {
    await request(app)
      .post('/v1/staff')
      .set('authorization', `Bearer ${cashierToken}`)
      .send({
        email: 'nope@admin.test',
        displayName: 'Nope',
        password: 'manager-pass-4',
        role: 'cashier',
      })
      .expect(403);
  });

  it('lists staff and changes one member permissions without touching the role preset', async () => {
    const list = await request(app)
      .get('/v1/staff')
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const manager = list.body.data.staff.find(
      (member: { email: string }) => member.email === 'manager@admin.test',
    );
    expect(manager).toBeTruthy();

    const updated = await request(app)
      .patch(`/v1/staff/${manager.userId}/permissions`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ permissions: ['stores:read', 'catalog:read', 'reports:read'] })
      .expect(200);

    expect(updated.body.data.permissions).toEqual(['stores:read', 'catalog:read', 'reports:read']);
  });

  it('refuses to let an admin change their own permissions', async () => {
    const list = await request(app)
      .get('/v1/staff')
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      list.body.data.staff.some((member: { userId: string }) => member.userId === OWNER_ID),
    ).toBe(true);

    await request(app)
      .patch(`/v1/staff/${OWNER_ID}/permissions`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ permissions: ['stores:read'] })
      .expect(403);
  });

  it('returns 404 for an unknown staff member', async () => {
    await request(app)
      .patch('/v1/staff/00000000-0000-4000-8000-0000000000ff/permissions')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ permissions: [] })
      .expect(404);
  });

  it('creates a counter inside the caller organization', async () => {
    const res = await request(app)
      .post('/v1/registers')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ storeId: STORE_MAIN, name: 'Front counter', code: 'C1' })
      .expect(201);

    expect(res.body.data).toMatchObject({
      organizationId: ORG,
      storeId: STORE_MAIN,
      name: 'Front counter',
      code: 'C1',
    });

    await request(app)
      .post('/v1/registers')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ storeId: STORE_MAIN, name: 'Duplicate', code: 'C1' })
      .expect(409);
  });

  it('rejects a counter for a store outside the caller organization or scope', async () => {
    await request(app)
      .post('/v1/registers')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ storeId: STORE_FOREIGN, name: 'Foreign till', code: 'F1' })
      .expect(422);

    await request(app)
      .post('/v1/registers')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ storeId: STORE_SECOND, name: 'Second till', code: 'C2' })
      .expect(201);

    await request(app)
      .post('/v1/registers')
      .set('authorization', `Bearer ${scopedManagerToken}`)
      .send({ storeId: STORE_SECOND, name: 'Out of scope', code: 'C3' })
      .expect(403);
  });
});

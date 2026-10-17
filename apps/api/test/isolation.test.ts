import type { Principal } from '@pos/contracts';
import type { OrganizationRef, StoreRecord, UserRecord } from '@pos/db';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp, type AppDeps } from '../src/app';
import { Argon2PasswordHasher } from '../src/core/passwordHasher';
import { createMemoryDeps } from '../src/deps';

const PASSWORD = 'password123';

const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';
const STORE_A1 = '00000000-0000-4000-8000-0000000000a1';
const STORE_A2 = '00000000-0000-4000-8000-0000000000a2';
const STORE_B1 = '00000000-0000-4000-8000-0000000000b1';

const CASHIER_A = '00000000-0000-4000-8000-0000000000c1';
const MANAGER_A = '00000000-0000-4000-8000-0000000000c2';
const ANALYST_A = '00000000-0000-4000-8000-0000000000c3';

const stores: StoreRecord[] = [
  { id: STORE_A1, organizationId: ORG_A, name: 'A One', timezone: 'Asia/Dhaka', isActive: true },
  { id: STORE_A2, organizationId: ORG_A, name: 'A Two', timezone: 'Asia/Dhaka', isActive: true },
  { id: STORE_B1, organizationId: ORG_B, name: 'B One', timezone: 'Asia/Dhaka', isActive: true },
];

const principals: Principal[] = [
  {
    userId: CASHIER_A,
    email: 'cashier-a@example.com',
    displayName: 'Cashier A',
    organizationId: ORG_A,
    storeIds: [STORE_A1],
    permissions: ['stores:read'],
  },
  {
    userId: MANAGER_A,
    email: 'manager-a@example.com',
    displayName: 'Manager A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['stores:read'],
  },
  {
    userId: ANALYST_A,
    email: 'analyst-a@example.com',
    displayName: 'Analyst A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['reports:read'],
  },
];

const organizations: OrganizationRef[] = [{ id: ORG_A, slug: 'org-a' }];

describe('tenant and RBAC isolation', () => {
  let app: ReturnType<typeof createApp>;
  let tokens: { cashierA: string; managerA: string; analystA: string };

  beforeAll(async () => {
    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    const users: UserRecord[] = principals.map((principal) => ({
      id: principal.userId,
      email: principal.email,
      passwordHash,
      displayName: principal.displayName,
      isActive: true,
    }));

    const deps: AppDeps = createMemoryDeps({
      users,
      principals,
      stores,
      organizations,
      memberships: principals.map((principal) => ({
        userId: principal.userId,
        organizationId: ORG_A,
      })),
    });
    app = createApp(deps);

    const login = async (email: string): Promise<string> => {
      const res = await request(app)
        .post('/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      return res.body.data.token as string;
    };

    tokens = {
      cashierA: await login('cashier-a@example.com'),
      managerA: await login('manager-a@example.com'),
      analystA: await login('analyst-a@example.com'),
    };
  });

  it('serves health without authentication', async () => {
    await request(app).get('/health').expect(200);
  });

  it('rejects requests without a bearer token', async () => {
    await request(app).get('/v1/stores').expect(401);
  });

  it('rejects an unknown session token', async () => {
    await request(app)
      .get('/v1/stores')
      .set('authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('returns only stores within the caller organization', async () => {
    const res = await request(app)
      .get('/v1/stores')
      .set('authorization', `Bearer ${tokens.cashierA}`)
      .expect(200);
    expect(res.body.data.stores).toHaveLength(2);
    expect(res.body.data.stores.map((store: StoreRecord) => store.id)).not.toContain(STORE_B1);
  });

  it('allows access to a store inside the assigned scope', async () => {
    await request(app)
      .get(`/v1/stores/${STORE_A1}`)
      .set('authorization', `Bearer ${tokens.cashierA}`)
      .expect(200);
  });

  it('denies a same-org store outside the caller scope', async () => {
    await request(app)
      .get(`/v1/stores/${STORE_A2}`)
      .set('authorization', `Bearer ${tokens.cashierA}`)
      .expect(403);
  });

  it('grants organization-wide scope when storeIds is empty', async () => {
    await request(app)
      .get(`/v1/stores/${STORE_A2}`)
      .set('authorization', `Bearer ${tokens.managerA}`)
      .expect(200);
  });

  it('cannot read another organization store by guessing its id', async () => {
    await request(app)
      .get(`/v1/stores/${STORE_B1}`)
      .set('authorization', `Bearer ${tokens.cashierA}`)
      .expect(404);
  });

  it('rejects a caller lacking the required permission', async () => {
    await request(app)
      .get('/v1/stores')
      .set('authorization', `Bearer ${tokens.analystA}`)
      .expect(403);
  });

  it('returns the authenticated session principal', async () => {
    const res = await request(app)
      .get('/v1/auth/session')
      .set('authorization', `Bearer ${tokens.cashierA}`)
      .expect(200);
    expect(res.body.data.user.organizationId).toBe(ORG_A);
  });
});
